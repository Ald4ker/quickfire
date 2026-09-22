#!/usr/bin/env python3
"""Download/normalize flag + jersey images and emit picture-topic pack files.

Outputs:
  assets/question-images/flags/*.webp
  assets/question-images/jerseys/*.webp
  assets/topics/guess_the_jersey.webp (topic card)
  constants/picture-topics/manifest.json
  constants/picture-topics/groups.json  (SourceGroup[] slice)
  constants/picture-topics/source-rows.csv
  constants/questionImages.ts (Metro require map)
"""

from __future__ import annotations

import csv
import json
import re
import unicodedata
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FLAG_CSV = Path.home() / "Downloads" / "flag_difficulty_list.csv"
JERSEY_CSV = (
    Path.home()
    / "Downloads"
    / "Guess the Jersey spreadsheet - whose_shirt_is_this_final_hashtags.csv"
)
JERSEY_PICS = Path.home() / "Downloads" / "Jersey pics"

FLAGS_OUT = ROOT / "assets" / "question-images" / "flags"
JERSEYS_OUT = ROOT / "assets" / "question-images" / "jerseys"
TOPICS_OUT = ROOT / "assets" / "topics"
PICTURE_DIR = ROOT / "constants" / "picture-topics"
QUESTION_IMAGES_TS = ROOT / "constants" / "questionImages.ts"
TMP = ROOT / "tmp" / "picture-topics"

FLAG_W, FLAG_H = 480, 320  # 3:2
FLAG_MATTE = (18, 18, 24, 255)
JERSEY_MAX = 512

FLAG_PROMPT = "Which country is this?"
JERSEY_PROMPT = "Whose shirt is this?"

# Display-name overrides when flagcdn names differ from the CSV.
COUNTRY_ALIASES = {
    "bolivia": "bo",
    "brunei": "bn",
    "cape verde": "cv",
    "cabo verde": "cv",
    "congo": "cg",
    "congo republic": "cg",
    "republic of the congo": "cg",
    "democratic republic of the congo": "cd",
    "dr congo": "cd",
    "drc": "cd",
    "czech republic": "cz",
    "czechia": "cz",
    "east timor": "tl",
    "timor-leste": "tl",
    "timor leste": "tl",
    "swaziland": "sz",
    "eswatini": "sz",
    "ivory coast": "ci",
    "cote divoire": "ci",
    "cote d ivoire": "ci",
    "cote d'ivoire": "ci",
    "laos": "la",
    "macedonia": "mk",
    "north macedonia": "mk",
    "micronesia": "fm",
    "moldova": "md",
    "myanmar": "mm",
    "burma": "mm",
    "north korea": "kp",
    "south korea": "kr",
    "korea": "kr",
    "palestine": "ps",
    "russia": "ru",
    "slovak republic": "sk",
    "syria": "sy",
    "taiwan": "tw",
    "tanzania": "tz",
    "turkey": "tr",
    "turkiye": "tr",
    "uae": "ae",
    "united arab emirates": "ae",
    "uk": "gb",
    "united kingdom": "gb",
    "great britain": "gb",
    "usa": "us",
    "united states": "us",
    "united states of america": "us",
    "vatican": "va",
    "vatican city": "va",
    "vietnam": "vn",
    "venezuela": "ve",
    "iran": "ir",
    "iraq": "iq",
}


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or "x"


def norm_name(text: str) -> str:
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def fetch_flag_codes() -> dict[str, str]:
    url = "https://flagcdn.com/en/codes.json"
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.load(resp)


def build_name_to_code(codes: dict[str, str]) -> dict[str, str]:
    mapping: dict[str, str] = dict(COUNTRY_ALIASES)
    for code, name in codes.items():
        if len(code) != 2:
            continue
        mapping[norm_name(name)] = code
        # "Côte d'Ivoire (Ivory Coast)" → also index the head + parenthetical.
        if "(" in name and ")" in name:
            head, rest = name.split("(", 1)
            mapping[norm_name(head)] = code
            mapping[norm_name(rest.replace(")", ""))] = code
    return mapping


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "BackfireAssetPrep/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        dest.write_bytes(resp.read())


def normalize_flag(src: Path, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    canvas = Image.new("RGBA", (FLAG_W, FLAG_H), FLAG_MATTE)
    scale = min(FLAG_W / img.width, FLAG_H / img.height)
    new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    resized = img.resize(new_size, Image.Resampling.LANCZOS)
    offset = ((FLAG_W - new_size[0]) // 2, (FLAG_H - new_size[1]) // 2)
    canvas.paste(resized, offset, resized)
    dest.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(dest, "WEBP", quality=82, method=6)


def normalize_jersey(src: Path, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    scale = min(JERSEY_MAX / img.width, JERSEY_MAX / img.height, 1.0)
    new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
    resized = img.resize(new_size, Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Keep alpha so transparent jersey art does not flatten to black.
    resized.save(dest, "WEBP", quality=82, method=6)


def jersey_csv_to_stem(question: str) -> str:
    # CSV: "Arsenal #10, 1995-2006" -> file stem "Arsenal and 10, 1995-2006"
    return question.replace("#", "and ")


def nfc_path_map(folder: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for path in folder.iterdir():
        if path.suffix.lower() != ".png":
            continue
        key = unicodedata.normalize("NFC", path.stem).casefold()
        out[key] = path
    return out


def write_question_images_ts(keys: list[str]) -> None:
    lines = [
        "/**",
        " * Bundled prompt images for picture topics.",
        " * Generated by scripts/prepare-picture-topic-assets.py — do not edit by hand.",
        " */",
        "",
        "import type { ImageSource } from 'expo-image';",
        "",
        "const MODULES: Record<string, ImageSource> = {",
    ]
    for key in keys:
        kind, name = key.split("/", 1)
        rel = f"../assets/question-images/{kind}/{name}.webp"
        lines.append(f"  '{key}': require('{rel}'),")
    lines.extend(
        [
            "};",
            "",
            "export function getQuestionImageSource(imageKey: string): ImageSource | null {",
            "  return MODULES[imageKey] ?? null;",
            "}",
            "",
            "export const QUESTION_IMAGE_KEYS = Object.freeze(Object.keys(MODULES));",
            "",
        ]
    )
    QUESTION_IMAGES_TS.write_text("\n".join(lines), encoding="utf-8")


def load_flag_rows() -> list[dict[str, str]]:
    with FLAG_CSV.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    out = []
    for row in rows:
        country = (row.get("Country") or "").strip()
        difficulty = (row.get("Difficulty") or "").strip()
        if not country or difficulty not in {"Easy", "Medium", "Hard"}:
            continue
        out.append({"country": country, "difficulty": difficulty})
    return out


def load_jersey_rows() -> list[dict[str, str]]:
    with JERSEY_CSV.open(newline="", encoding="utf-8-sig") as f:
        return [
            {
                "question": r["Question"].strip(),
                "answer": r["Answer"].strip(),
                "difficulty": r["Difficulty"].strip(),
                "topic": r["Topic"].strip(),
            }
            for r in csv.DictReader(f)
            if r.get("Question") and r.get("Answer")
        ]


def main() -> None:
    FLAGS_OUT.mkdir(parents=True, exist_ok=True)
    JERSEYS_OUT.mkdir(parents=True, exist_ok=True)
    PICTURE_DIR.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    codes = fetch_flag_codes()
    name_to_code = build_name_to_code(codes)

    flag_rows = load_flag_rows()
    jersey_rows = load_jersey_rows()
    jersey_files = nfc_path_map(JERSEY_PICS)

    manifest: dict[str, dict] = {}
    image_keys: list[str] = []
    source_rows: list[dict[str, str]] = []
    groups_bucket: dict[tuple[str, int, str], list[dict]] = defaultdict(list)

    # --- Flags ---
    missing_flags: list[str] = []
    for row in flag_rows:
        country = row["country"]
        code = name_to_code.get(norm_name(country))
        if not code:
            missing_flags.append(country)
            continue
        image_key = f"flags/{code}"
        raw = TMP / "flags-raw" / f"{code}.png"
        webp = FLAGS_OUT / f"{code}.webp"
        if not webp.exists() or not raw.exists():
            download(f"https://flagcdn.com/w320/{code}.png", raw)
            normalize_flag(raw, webp)
        elif not webp.exists():
            normalize_flag(raw, webp)

        manifest[image_key] = {
            "topic": "Guess the Flag",
            "answer": country,
            "difficulty": row["difficulty"],
            "code": code,
        }
        image_keys.append(image_key)
        points = {"Easy": 100, "Medium": 200, "Hard": 300}[row["difficulty"]]
        groups_bucket[("Guess the Flag", points, "gen28")].append(
            {
                "text": FLAG_PROMPT,
                "answer": country,
                "imageKey": image_key,
            }
        )
        source_rows.append(
            {
                "Question": FLAG_PROMPT,
                "Answer": country,
                "Difficulty": row["difficulty"],
                "Topic": "Guess the Flag",
                "ImageKey": image_key,
            }
        )

    if missing_flags:
        raise SystemExit(f"Unmapped flag countries ({len(missing_flags)}): {missing_flags}")

    # --- Jerseys ---
    missing_jerseys: list[str] = []
    for row in jersey_rows:
        stem = jersey_csv_to_stem(row["question"])
        key = unicodedata.normalize("NFC", stem).casefold()
        src = jersey_files.get(key)
        if not src:
            missing_jerseys.append(row["question"])
            continue
        image_key = f"jerseys/{slugify(stem)}"
        webp = JERSEYS_OUT / f"{slugify(stem)}.webp"
        if not webp.exists():
            normalize_jersey(src, webp)

        manifest[image_key] = {
            "topic": "Guess the Jersey",
            "answer": row["answer"],
            "difficulty": row["difficulty"],
            "clue": row["question"],
        }
        image_keys.append(image_key)
        points = {"Easy": 100, "Medium": 200, "Hard": 300}[row["difficulty"]]
        groups_bucket[("Guess the Jersey", points, "gen29")].append(
            {
                "text": JERSEY_PROMPT,
                "answer": row["answer"],
                "imageKey": image_key,
            }
        )
        source_rows.append(
            {
                "Question": JERSEY_PROMPT,
                "Answer": row["answer"],
                "Difficulty": row["difficulty"],
                "Topic": "Guess the Jersey",
                "ImageKey": image_key,
            }
        )

    if missing_jerseys:
        raise SystemExit(
            f"Unmatched jersey pics ({len(missing_jerseys)}): {missing_jerseys[:10]}"
        )

    # Topic card art for jersey (crop/center first easy jersey)
    topic_src = next(
        JERSEYS_OUT / f"{slugify(jersey_csv_to_stem(r['question']))}.webp"
        for r in jersey_rows
        if r["difficulty"] == "Easy"
    )
    topic_dest = TOPICS_OUT / "guess_the_jersey.webp"
    img = Image.open(topic_src).convert("RGB")
    side = min(img.size)
    left = (img.width - side) // 2
    top = (img.height - side) // 2
    img.crop((left, top, left + side, top + side)).resize(
        (512, 512), Image.Resampling.LANCZOS
    ).save(topic_dest, "WEBP", quality=85, method=6)

    # Stable group ids for the picture slice
    groups = []
    group_num = 9001
    for (topic, points, category_id), qas in sorted(
        groups_bucket.items(), key=lambda x: (x[0][2], x[0][1])
    ):
        groups.append(
            {
                "id": f"q_{group_num}",
                "questionAndanswer": qas,
                "categoryId": category_id,
                "name": topic,
                "points": points,
            }
        )
        group_num += 1

    image_keys = sorted(set(image_keys))
    write_question_images_ts(image_keys)

    (PICTURE_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (PICTURE_DIR / "groups.json").write_text(
        json.dumps(groups, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    with (PICTURE_DIR / "source-rows.csv").open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Question", "Answer", "Difficulty", "Topic", "ImageKey"],
        )
        writer.writeheader()
        writer.writerows(source_rows)

    flag_counts = Counter(r["difficulty"] for r in flag_rows)
    jersey_counts = Counter(r["difficulty"] for r in jersey_rows)
    print(
        f"Flags: {len(flag_rows)} ({dict(flag_counts)})  "
        f"Jerseys: {len(jersey_rows)} ({dict(jersey_counts)})  "
        f"images: {len(image_keys)}"
    )
    print(f"Wrote {QUESTION_IMAGES_TS.relative_to(ROOT)}")
    print(f"Wrote {PICTURE_DIR.relative_to(ROOT)}/groups.json")


if __name__ == "__main__":
    main()
