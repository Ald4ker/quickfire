# Product

<!-- impeccable:product-schema 1 -->

> Written by Impeccable `init` in unattended night mode (TASK-040, 27-28 Sep 2026). No interview was possible, so every fact below is inferred from the repository and Ammar's 27 Sep brief and is marked (inferred) until he confirms it.

## Platform

adaptive (Expo / React Native shipping to iOS and Android, plus a web build at playbackfire.com) (inferred)

## Users

Groups of friends, families and student societies playing trivia together in one room. One person, the host, holds the phone (landscape) and runs the game; teams answer aloud and the host awards points. (inferred from the play flow and the society outreach work)

## Product Purpose

A pass-and-play team trivia game: pick topics, split into teams, play a board of topics x point values, reveal questions and answers, award points, crown a winner. Success is a group that wants "one more match" and buys tokens to play it. (inferred)

## Positioning

A host-led, one-device party quiz with a curated question bank (about 10,000 questions, 17 languages) and wager and lifeline mechanics, closer to a TV quiz night than to a solo quiz app. (inferred)

## Operating Context

Played in living rooms, pubs and society socials, often on a phone screen shown to a group, in mixed and sometimes dim light, with short attention spans between questions. (inferred)

## Capabilities and Constraints

Modes: Quick Play, Classic, Random, Rumble. Tokens gate matches. Auth (Clerk) is required; backend is Convex. Landscape is forced on phones. RTL locales (Arabic, Urdu) must work. (from code)

## Brand Commitments

Name "BackFire". Bundled faces Clash Display and General Sans. Soft UI on home and lobby: warm cream canvas #F0EBE3, white surfaces, charcoal #333333 text. Functional accents Electric Blue #007BFF, Lively Orange #FF8C00, Vivid Purple #A18FFC. See docs/BRAND_GUIDELINES.md. Ammar's 27 Sep brief: "prestigious, luxurious, high quality, like there's a big studio behind it, a triple-A version of mobile party games; clean and modern". (from docs and brief)

## Evidence on Hand

Pixel-art topic illustrations under assets/, the flame "BackFire" wordmark, QR codes for the stores. No testimonials or press to cite. (from repo)

## Product Principles

1. The host is the interface: every screen must be readable at arm's length by a group, not only by the person holding the phone. (inferred)
2. The reveal is the product: question and answer reveals are the peak moments and deserve the most craft. (inferred)
3. Premium through restraint and finish, not decoration. (from brief)
