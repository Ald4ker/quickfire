import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  useWindowDimensions,
  Platform,
  type LayoutChangeEvent,
  type ListRenderItem,
} from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { BREAKPOINTS, SPACING, FONTS, FONT_SIZES, BORDER_RADIUS, HEADER } from '@/constants';
import {
  getCategoryPictureSource,
  MISSING_CATEGORY_PICTURE_LABEL,
} from '@/constants/categoryPictures';
import { getModeCategoryCount } from '@/features/play/data';
import type { CategoryOption, GameMode } from '@/features/shared';
import { PlayScaffold } from '@/features/play/components/PlayScaffold';
import { isActiveMatchStep, routeForPlayStep } from '@/features/play/sessionRouting';
import { SOFT_SURFACE_STYLES } from '@/features/play/styles/softSurface';
import {
  groupCategoriesBySection,
  type CategorySection,
} from '@/features/play/categorySections';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { useStudio } from '@/components/studio/useStudio';
import { softSurfaceLift } from '@/features/play/styles/softSurface';
import { showThemedAlert } from '@/store/themedAlert';
import { getRowDirection } from '@/lib/i18n/direction';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { isAuthDisabled } from '@/lib/authMode';
import { goBackOrReplace } from '@/lib/navigation/goBackOrReplace';
import {
  consumeGameEntry,
  refundGameEntry,
  reserveGameEntry,
} from '@/lib/wallet/gameEntry';
import { getGameTokenCost } from '@/features/play/tokenCosts';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import { useResponsivePlayFontSizes } from '@/utils/responsiveTypography';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import { getWebViewportScale } from '@/lib/layout/webViewportScale';

// ── Grid constants ──────────────────────────────────────────────────────

const WEB_CARD_HEIGHT = 190;
const NATIVE_CARD_ASPECT = 0.82; // Taller cards preserve artwork size across five columns.
/** Artwork share of the base card height; residual was too short for two-line titles. */
const TOPIC_IMAGE_AREA_RATIO = 0.78;
/** Vertical padding inside the white topic label bar (top + bottom each). */
const TOPIC_TITLE_BAR_PAD_V = 2;
const TOPIC_TITLE_BAR_BORDER = 1;
/** Tiny breathing room beyond a strict two-line fit so descenders aren't tight. */
const TOPIC_TITLE_BAR_EXTRA = 2;
const TOPIC_TITLE_LINE_HEIGHT_RATIO = 1.18;
const COLS = 5;
const ANDROID_LIST_IMAGE_TRANSITION = 0;
const WEB_LIST_IMAGE_TRANSITION = 200;

type CategoryListItem =
  | {
      kind: 'header';
      id: string;
      title: string;
      sectionWidth: number;
      marginTop: number;
      paddingBottom: number;
    }
  | {
      kind: 'row';
      id: string;
      sectionWidth: number;
      categories: CategoryOption[];
      marginBottom: number;
    };

type CategoryItemLayout = { length: number; offset: number };
type CategoryListData = {
  rows: CategoryListItem[];
  layouts: CategoryItemLayout[];
  slugToIndex: Map<string, number>;
};

function buildCategoryListData(
  sections: CategorySection[],
  cols: number,
  rowWidth: number,
  cardH: number,
  gridGap: number,
  sectionTitleHeight: number
): CategoryListData {
  const rows: CategoryListItem[] = [];
  const layouts: CategoryItemLayout[] = [];
  const slugToIndex = new Map<string, number>();
  let offset = SPACING.xs;

  sections.forEach((section, sectionIndex) => {
    // Clear break between sections (General Knowledge → History, etc.).
    // This is larger than the in-section row gap so groups don't read as one list.
    const marginTop = sectionIndex > 0 ? gridGap * 2 + SPACING.xxl : 0;
    // Full column width so header chrome and card rows share one left/right edge
    // (Android FlatList rows do not stretch to the parent on their own).
    const sectionWidth = rowWidth;

    const headerLength = marginTop + sectionTitleHeight + SPACING.sm;
    rows.push({
      kind: 'header',
      id: `header-${section.id}`,
      title: section.title,
      sectionWidth,
      marginTop,
      paddingBottom: SPACING.sm,
    });
    layouts.push({ length: headerLength, offset });
    offset += headerLength;

    const categoryRows = Math.ceil(section.categories.length / cols);
    for (let rowIndex = 0; rowIndex < categoryRows; rowIndex += 1) {
      const categories = section.categories.slice(rowIndex * cols, rowIndex * cols + cols);
      const listIndex = rows.length;
      for (const category of categories) {
        slugToIndex.set(category.slug, listIndex);
      }

      const isLastRowInSection = rowIndex === categoryRows - 1;
      const marginBottom = isLastRowInSection ? 0 : gridGap;
      const rowLength = cardH + marginBottom;

      rows.push({
        kind: 'row',
        id: `row-${section.id}-${rowIndex}`,
        sectionWidth,
        categories,
        marginBottom,
      });
      layouts.push({ length: rowLength, offset });
      offset += rowLength;
    }
  });

  return { rows, layouts, slugToIndex };
}

interface CategoryCardProps {
  category: CategoryOption;
  selected: boolean;
  disabled: boolean;
  cardW: number;
  cardH: number;
  imageAreaH: number;
  titleBarH: number;
  surface: string;
  textPrimary: string;
  topicTitleSize: number;
  topicImageMatte?: string;
  topicImageContentFit: 'cover' | 'contain';
  missingPictureLabelColor?: string;
  topicLabelBackground: string;
  topicLabelText: string;
  topicLabelBorder: string;
  selectedBorder: string;
  onToggle: (slug: string) => void;
}

const CategoryCard = memo(function CategoryCard({
  category,
  selected,
  disabled,
  cardW,
  cardH,
  imageAreaH,
  titleBarH,
  surface,
  textPrimary,
  topicTitleSize,
  topicImageMatte,
  topicImageContentFit,
  missingPictureLabelColor,
  topicLabelBackground,
  topicLabelText,
  topicLabelBorder,
  selectedBorder,
  onToggle,
}: CategoryCardProps) {
  const imageSource = getCategoryPictureSource(category.id);
  const isAndroid = Platform.OS === 'android';
  const darkModeFlatTop = useDarkModeFlatTop();
  // Pixel square: Android expo-image ignores contentFit when width/height are 100%
  // in a landscape slot, which stretches square topic art into wide ellipses.
  const artSide = Math.min(cardW, imageAreaH);

  return (
    <Pressable
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Select ${category.title}`}
      accessibilityState={{ selected, disabled }}
      onPress={() => onToggle(category.slug)}
      style={({ pressed }) => [
        styles.topicCard,
        {
          width: cardW,
          height: cardH,
          backgroundColor: surface,
          // Keep border width constant so select/deselect never reflows image bounds
          // (Android expo-image blanks when parent layout thrashing or opacity changes).
          borderColor: selected ? selectedBorder : 'transparent',
          // Android: never set opacity on an ancestor of expo-image because it blanks the bitmap.
          // Use scale for press, and a dim overlay for disabled (below).
          ...(isAndroid
            ? { opacity: 1 }
            : { opacity: disabled ? 0.35 : pressed ? 0.94 : 1 }),
          transform: pressed && !disabled ? [{ scale: 0.98 }] : [{ scale: 1 }],
        },
        SOFT_SURFACE_STYLES.face,
        darkModeFlatTop,
        !isAndroid && SOFT_SURFACE_STYLES.raised,
      ]}
    >
      <View
        // Android can collapse/detach image views during parent re-layout; keep the host.
        collapsable={isAndroid ? false : undefined}
        style={[
          styles.cardImageArea,
          { height: imageAreaH, backgroundColor: topicImageMatte ?? surface },
        ]}
      >
        {imageSource ? (
          <Image
            source={imageSource}
            // recyclingKey is for remote URL reuse; local require() + Android recycling
            // has blanked bitmaps on select re-renders. Keep on non-Android only.
            recyclingKey={isAndroid ? undefined : category.slug}
            cachePolicy="memory-disk"
            // Web: avoid eager-fetch of offscreen cards (FlatList still mounts a window).
            loading="lazy"
            priority="low"
            style={{ width: artSide, height: artSide }}
            contentFit={topicImageContentFit}
            transition={isAndroid ? ANDROID_LIST_IMAGE_TRANSITION : WEB_LIST_IMAGE_TRANSITION}
          />
        ) : (
          <Text
            style={[
              styles.missingPictureLabel,
              { color: missingPictureLabelColor ?? textPrimary },
            ]}
            accessibilityLabel={MISSING_CATEGORY_PICTURE_LABEL}
          >
            {MISSING_CATEGORY_PICTURE_LABEL}
          </Text>
        )}
      </View>

      <View
        testID={`topic-label-${category.slug}`}
        style={[
          styles.cardTitleBar,
          {
            height: titleBarH,
            backgroundColor: topicLabelBackground,
            borderTopColor: topicLabelBorder,
          },
        ]}
      >
        <Text
          style={[
            styles.cardTitle,
            {
              color: topicLabelText,
              fontSize: topicTitleSize,
              lineHeight: Math.round(topicTitleSize * TOPIC_TITLE_LINE_HEIGHT_RATIO),
            },
          ]}
          numberOfLines={2}
        >
          {category.title.toUpperCase()}
        </Text>
      </View>

      {selected ? (
        <View style={styles.selectedBadge}>
          <Ionicons name="checkmark" size={12} color="#FFFFFF" />
        </View>
      ) : null}

      {isAndroid && disabled ? (
        <View
          pointerEvents="none"
          style={[styles.disabledDim, { backgroundColor: surface }]}
        />
      ) : null}
    </Pressable>
  );
});

export default function CategorySelectionScreen() {
  const studio = useStudio();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const categoryListRef = useRef<FlatList<CategoryListItem> | null>(null);
  const { direction, getTextStyle, t } = useI18n();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const fontSizes = useResponsivePlayFontSizes();
  const darkModeFlatTop = useDarkModeFlatTop();

  const session = usePlayStore((state) => state.session);
  const entryReservationId = usePlayStore((state) => state.entryReservationId);
  const setEntryReservationId = usePlayStore((state) => state.setEntryReservationId);
  const commitEntryCharge = usePlayStore((state) => state.commitEntryCharge);
  const ensureDraft = usePlayStore((state) => state.ensureDraft);
  const toggleCategory = usePlayStore((state) => state.toggleCategory);
  const setCategories = usePlayStore((state) => state.setCategories);
  const startBoard = usePlayStore((state) => state.startBoard);
  const { isLoaded, isSignedIn } = useAuth();
  const authDisabled = isAuthDisabled();
  const reserveGameEntryMutation = useMutation(api.wallet.reserveGameEntry);
  const consumeEntryMutation = useMutation(api.wallet.consumeEntry);
  const refundEntryMutation = useMutation(api.wallet.refundEntry);
  const recordTopicSelectionMutation = useMutation(api.sessions.recordTopicSelection);

  useLayoutEffect(() => {
    ensureDraft();
  }, [ensureDraft]);

  // Browser/history back can reopen setup while a match is live - return to the leave-capable match UI.
  useEffect(() => {
    const step = session?.step;
    if (!isActiveMatchStep(step) || !step) return;
    const target = routeForPlayStep(step);
    if (target) {
      router.replace(target);
    }
  }, [router, session?.step]);

  const required = useMemo(() => {
    if (!session) return 0;
    // SAFETY: session.mode is always a GameMode from the play store.
    return getModeCategoryCount(
      session.mode as GameMode,
      session.config.quickPlayTopicCount
    );
  }, [session]);

  const selectedCategories = useMemo(() => {
    if (!session) return [];
    const categoriesBySlug = new Map(
      session.availableCategories.map((category) => [category.slug, category])
    );
    return (session.selectedCategoryIds ?? [])
      .map((slug) => categoriesBySlug.get(slug))
      .filter((category): category is NonNullable<typeof category> => Boolean(category));
  }, [session]);

  const isWeb = Platform.OS === 'web';
  const useWebLayout = isWeb && windowWidth >= BREAKPOINTS.wide;
  const isLandscape = windowWidth > windowHeight;
  const compactHeader = !useWebLayout && isLandscape;
  const chromeScale = isWeb ? getWebViewportScale(windowWidth, windowHeight) : 1;
  const chromeH = Math.round(44 * chromeScale);
  const chromeRadius = Math.round(14 * chromeScale);

  const topicLayout = topicCardScreenPadding(
    windowWidth,
    { left: insets.left, right: insets.right },
    isWeb
  );
  const gridGap = topicLayout.gap;
  // Fallback until onLayout reports the real padded column width. Android's
  // layout width can disagree with useWindowDimensions (nav bar / insets).
  const [colW, setColW] = useState(topicLayout.contentWidth);
  useEffect(() => {
    setColW(topicLayout.contentWidth);
  }, [topicLayout.contentWidth]);
  const onColLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) {
      setColW((prev) => (Math.abs(prev - next) > 1 ? next : prev));
    }
  }, []);
  const innerW = colW;
  const cardW = Math.max(1, Math.floor((colW - gridGap * (COLS - 1)) / COLS));

  const baseCardH = useWebLayout
    ? WEB_CARD_HEIGHT
    : Math.floor(cardW * NATIVE_CARD_ASPECT);

  // ── Handlers ─────────────────────────────────────────────────────────

  const onSelectRandom = () => {
    if (!session) return;
    if ((session.selectedCategoryIds ?? []).length >= required) return;

    const selectedSlugs = new Set(session.selectedCategoryIds ?? []);
    const remainingCategories = session.availableCategories.filter(
      (category) => !selectedSlugs.has(category.slug)
    );
    const randomCategory =
      remainingCategories[Math.floor(Math.random() * remainingCategories.length)];

    if (randomCategory) {
      setCategories([...(session.selectedCategoryIds ?? []), randomCategory.slug]);
    }
  };

  const scrollToCategory = (slug: string) => {
    const index = categorySlugToIndex.get(slug);
    if (index === undefined) return;
    categoryListRef.current?.scrollToIndex({
      index,
      viewOffset: SPACING.sm,
      animated: true,
    });
  };

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      categoryListRef.current?.scrollToOffset({
        offset: Math.max(info.averageItemLength * info.index - SPACING.sm, 0),
        animated: false,
      });
      requestAnimationFrame(() => {
        categoryListRef.current?.scrollToIndex({
          index: info.index,
          viewOffset: SPACING.sm,
          animated: true,
        });
      });
    },
    []
  );

  // ── Derived state ─────────────────────────────────────────────────────

  const isLoading = !session;
  const selectedCount = (session?.selectedCategoryIds ?? []).length;
  const isVeryDense = selectedCount >= 5;
  const selectedPillGap = selectedCount >= 5 ? 6 : 10;
  const selectedStripInnerW = Math.max(1, innerW);
  const selectedPillWidth =
    selectedCount > 0
      ? Math.max(
          1,
          Math.floor(
            (selectedStripInnerW - selectedPillGap * Math.max(0, selectedCount - 1)) /
              selectedCount
          )
        )
      : 0;
  // Subscribe so canvas/surface tokens recompute when the palette changes.
  useThemeStore((state) => state.paletteId);
  const surfaceColors = getPlaySurfaceColors();
  const canvas = surfaceColors.canvas;
  const surface = surfaceColors.surface;
  const textPrimary = surfaceColors.textPrimary;
  const controlBackground = surfaceColors.controlBackground;
  const canChooseRandom = session && selectedCount < required;
  const categorySections = useMemo(
    () => (session ? groupCategoriesBySection(session.availableCategories) : []),
    [session]
  );
  const longestTopicTitleLength = Math.max(
    1,
    ...categorySections.flatMap((section) =>
      section.categories.map((category) => category.title.length)
    )
  );
  // Size type from width first, then size the label bar to fit two full lines.
  // (Previously the bar was a fixed ~22% of the card and clipped "Capital Cities".)
  const topicTitleSize = Math.max(
    5,
    Math.min(
      fontSizes.topicTitle,
      Math.floor(((cardW - 12) * 2) / (longestTopicTitleLength * 0.6))
    )
  );
  const topicTitleLineHeight = Math.round(topicTitleSize * TOPIC_TITLE_LINE_HEIGHT_RATIO);
  const titleBarH =
    topicTitleLineHeight * 2 +
    TOPIC_TITLE_BAR_PAD_V * 2 +
    TOPIC_TITLE_BAR_BORDER +
    TOPIC_TITLE_BAR_EXTRA;
  const minImageAreaH = Math.floor(baseCardH * TOPIC_IMAGE_AREA_RATIO);
  // Grow the card only when the two-line label needs more than the old residual.
  const cardH = Math.max(baseCardH, minImageAreaH + titleBarH);
  const imageAreaH = cardH - titleBarH;
  // Section headers sit between the page title and body text.
  const sectionTitleSize = Math.round(fontSizes.subtitle * 1.2);
  const sectionTitleHeight = Math.round(sectionTitleSize * 1.2);
  const { categoryListRows, categoryItemLayouts, categorySlugToIndex } = useMemo(() => {
    if (!categorySections.length) {
      const emptyRows: CategoryListItem[] = [];
      const emptyLayouts: CategoryItemLayout[] = [];
      return {
        categoryListRows: emptyRows,
        categoryItemLayouts: emptyLayouts,
        categorySlugToIndex: new Map<string, number>(),
      };
    }

    const { rows, layouts, slugToIndex } = buildCategoryListData(
      categorySections,
      COLS,
      innerW,
      cardH,
      gridGap,
      sectionTitleHeight
    );

    return {
      categoryListRows: rows,
      categoryItemLayouts: layouts,
      categorySlugToIndex: slugToIndex,
    };
  }, [cardH, categorySections, gridGap, innerW, sectionTitleHeight]);

  const selectedCategoryIds = useMemo(
    () => session?.selectedCategoryIds ?? [],
    [session?.selectedCategoryIds]
  );

  const handleToggleCategory = useCallback(
    (slug: string) => {
      toggleCategory(slug);
    },
    [toggleCategory]
  );

  const getCategoryItemLayout = useCallback(
    (_data: ArrayLike<CategoryListItem> | null | undefined, index: number) => {
      const layout = categoryItemLayouts[index];
      // VirtualizedList requires `index` on the returned frame. Without it,
      // react-native-web throws: "Should not have to estimate frames when a
      // measurement metrics function is provided".
      if (layout) {
        return { length: layout.length, offset: layout.offset, index };
      }
      return { length: cardH, offset: cardH * index, index };
    },
    [cardH, categoryItemLayouts]
  );

  const renderCategoryListItem: ListRenderItem<CategoryListItem> = useCallback(
    ({ item }) => {
      if (item.kind === 'header') {
        return (
          <View
            style={[
              styles.listItemWrap,
              {
                marginTop: item.marginTop,
                paddingBottom: item.paddingBottom,
              },
            ]}
          >
            <Text
              style={[
                styles.sectionTitle,
                {
                  color: textPrimary,
                  fontSize: sectionTitleSize,
                  height: sectionTitleHeight,
                },
              ]}
            >
              {item.title.toUpperCase()}
            </Text>
          </View>
        );
      }

      return (
        <View
          style={[
            styles.listItemWrap,
            { marginBottom: item.marginBottom },
          ]}
        >
          <View style={[styles.sectionGrid, { gap: gridGap }]}>
            {item.categories.map((category) => {
              const selected = selectedCategoryIds.includes(category.slug);
              const disabled = !selected && selectedCount >= required;

              return (
                <CategoryCard
                  key={category.slug}
                  category={category}
                  selected={selected}
                  disabled={disabled}
                  cardW={cardW}
                  cardH={cardH}
                  imageAreaH={imageAreaH}
                  titleBarH={titleBarH}
                  surface={surface}
                  textPrimary={textPrimary}
                  topicTitleSize={topicTitleSize}
                  topicImageMatte={surfaceColors.topicImageMatte}
                  topicImageContentFit={surfaceColors.topicImageContentFit}
                  missingPictureLabelColor={surfaceColors.missingPictureLabelColor}
                  topicLabelBackground={surfaceColors.topicLabelBackground}
                  topicLabelText={surfaceColors.topicLabelText}
                  topicLabelBorder={surfaceColors.topicLabelBorder}
                  selectedBorder={surfaceColors.selectedBorder}
                  onToggle={handleToggleCategory}
                />
              );
            })}
          </View>
        </View>
      );
    },
    [
      cardH,
      cardW,
      gridGap,
      handleToggleCategory,
      imageAreaH,
      required,
      sectionTitleHeight,
      sectionTitleSize,
      selectedCategoryIds,
      selectedCount,
      surface,
      surfaceColors.missingPictureLabelColor,
      surfaceColors.selectedBorder,
      surfaceColors.topicImageContentFit,
      surfaceColors.topicImageMatte,
      surfaceColors.topicLabelBackground,
      surfaceColors.topicLabelBorder,
      surfaceColors.topicLabelText,
      textPrimary,
      titleBarH,
      topicTitleSize,
    ]
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <PlayScaffold
      title={isLoading ? t('common.loading') : ''}
      backgroundColor={canvas}
      bodyFrame={false}
      bodyEdgeToEdge
      bodyScrollEnabled={false}
      contentSafeAreaHorizontal
      chromeColumnStyle={compactHeader ? styles.compactChrome : undefined}
      customHeader={
        isLoading ? null : (
          <View
            onLayout={onColLayout}
            style={[
              styles.headerWrap,
              compactHeader && styles.headerWrapCompact,
              { paddingBottom: Math.round(HEADER.bottomGap * chromeScale) },
            ]}
          >
            {/* Header row: back + counter | title | random button */}
            <View style={[styles.headerRow, compactHeader && styles.headerRowCompact]}>
              <View style={styles.headerLeft}>
                <HeaderBackButton
                  onPress={() => goBackOrReplace(router, '/play/team-setup')}
                  direction={direction}
                  rowDirection={getRowDirection(direction)}
                  label={t('common.back')}
                  accessibilityLabel="Back to team setup"
                  variant="icon"
                />
                <View
                  style={[
                    styles.counterBadge,
                    styles.surfaceRaised,
                    SOFT_SURFACE_STYLES.face,
                    darkModeFlatTop,
                    SOFT_SURFACE_STYLES.raised,
                    {
                      backgroundColor: controlBackground,
                      height: chromeH,
                      minHeight: chromeH,
                      minWidth: chromeH,
                      borderRadius: chromeRadius,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.counterText,
                      {
                        color: textPrimary,
                        fontSize: fontSizes.headerButton,
                        lineHeight: Math.round(fontSizes.headerButton * 1.2),
                      },
                    ]}
                  >
                    {selectedCount}/{required}
                  </Text>
                </View>
              </View>

              <View style={styles.headerCenter} pointerEvents="none">
                <Text
                  style={[
                    styles.mainTitle,
                    { color: textPrimary },
                    compactHeader && styles.mainTitleCompact,
                    getTextStyle(undefined, 'displayBold', 'center'),
                    {
                      fontSize: compactHeader
                        ? Math.round(fontSizes.pageTitle * 0.82)
                        : fontSizes.pageTitle,
                      lineHeight: Math.round(
                        (compactHeader
                          ? Math.round(fontSizes.pageTitle * 0.82)
                          : fontSizes.pageTitle) * 1.15
                      ),
                    },
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {t('play.pickTopicsTitle').toUpperCase()}
                </Text>

                {/* Subtitle - always directly under the title so it stays attached */}
                <Text
                  style={[
                    styles.subtitle,
                    compactHeader && styles.subtitleCompact,
                    { color: textPrimary },
                    getTextStyle(undefined, 'body', 'center'),
                    {
                      fontSize: compactHeader
                        ? Math.round(fontSizes.subtitle * 0.9)
                        : fontSizes.subtitle,
                      lineHeight: Math.round(
                        (compactHeader
                          ? Math.round(fontSizes.subtitle * 0.9)
                          : fontSizes.subtitle) * 1.25
                      ),
                    },
                  ]}
                  numberOfLines={1}
                >
                  {t('play.pickTopicsSubtitle', { count: required })}
                </Text>
              </View>

              <View style={styles.headerRight}>
                <Pressable
                  onPress={onSelectRandom}
                  disabled={!canChooseRandom}
                  accessibilityRole="button"
                  accessibilityLabel="Choose a random topic"
                  accessibilityState={{ disabled: !canChooseRandom }}
                  style={({ pressed }) => [
                    styles.randomBtn,
                    styles.surfaceRaised,
                    SOFT_SURFACE_STYLES.face,
                    darkModeFlatTop,
                    SOFT_SURFACE_STYLES.raised,
                    {
                      backgroundColor: controlBackground,
                      height: chromeH,
                      minHeight: chromeH,
                      borderRadius: chromeRadius,
                      opacity: !canChooseRandom ? 0.45 : pressed ? 0.9 : 1,
                      transform: pressed && canChooseRandom ? [{ scale: 0.98 }] : [{ scale: 1 }],
                    },
                  ]}
                >
                  <Ionicons name="shuffle-outline" size={18} color={textPrimary} />
                  <Text
                    style={[
                      styles.randomBtnLabel,
                      {
                        color: textPrimary,
                        fontSize: fontSizes.headerButton,
                        lineHeight: Math.round(fontSizes.headerButton * 1.2),
                      },
                    ]}
                    numberOfLines={1}
                  >
                    Random Topic
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )
      }
      footer={null}
    >
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <Text style={{ color: textPrimary }}>{t('common.loading')}</Text>
        </View>
      ) : (
        <View style={styles.contentRoot} onLayout={onColLayout}>
          {/* Selected topics strip - above the grid */}
          {selectedCategories.length > 0 && (
            <View style={styles.selectedStrip}>
              <View
                style={[
                  styles.selectedStripContent,
                  {
                    gap: selectedPillGap,
                    width: selectedStripInnerW,
                    height: chromeH,
                    alignSelf: 'center',
                  },
                ]}
              >
                {selectedCategories.map((category) => (
                  // Sibling press targets are not nested. RN Web maps Pressable to <button>,
                  // and nested buttons are invalid HTML / console errors.
                  <View
                    key={category.slug}
                    style={[
                      styles.selectedTopicPill,
                      compactHeader && styles.selectedTopicPillCompact,
                      SOFT_SURFACE_STYLES.raised,
                      {
                        backgroundColor: controlBackground,
                        width: selectedPillWidth,
                        maxWidth: selectedPillWidth,
                        height: chromeH,
                        borderRadius: chromeRadius,
                      },
                      isVeryDense && styles.selectedPillVeryDense,
                    ]}
                  >
                    <Pressable
                      onPress={() => scrollToCategory(category.slug)}
                      accessibilityRole="button"
                      accessibilityLabel={`Jump to ${category.title}`}
                      style={({ pressed }) => [
                        styles.selectedPillLabelHit,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectedPillText,
                          isVeryDense && styles.selectedPillTextDense,
                          {
                            color: textPrimary,
                            fontSize: fontSizes.headerButton,
                            lineHeight: Math.round(fontSizes.headerButton * 1.2),
                          },
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {category.title.toUpperCase()}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${category.title}`}
                      // Extra hit area without adding visual inset past the right padding.
                      hitSlop={8}
                      onPress={() => toggleCategory(category.slug)}
                      style={({ pressed }) => [
                        isVeryDense ? styles.selectedPillCloseDense : styles.selectedPillClose,
                        { opacity: pressed ? 0.55 : 1 },
                      ]}
                    >
                      <Ionicons
                        name="close"
                        size={isVeryDense ? 14 : 16}
                        color={textPrimary}
                      />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Topic grid */}
          <View style={styles.gridContainer}>
            <FlatList
              ref={categoryListRef}
              data={categoryListRows}
              keyExtractor={(item) => item.id}
              renderItem={renderCategoryListItem}
              getItemLayout={getCategoryItemLayout}
              onScrollToIndexFailed={onScrollToIndexFailed}
              showsVerticalScrollIndicator={false}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={7}
              removeClippedSubviews={false}
              contentContainerStyle={[
                styles.gridScrollContent,
                { paddingBottom: 160 },
              ]}
              style={styles.categoryList}
            />
          </View>
        </View>
      )}

      {/* Floating action: "START BOARD" */}
      {isLoading || selectedCount !== required ? null : (
        <View
          style={[
            styles.floatingPanel,
            { bottom: Math.max(insets.bottom, SPACING.lg) },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('play.startBoard')}
            onPress={async () => {
              if (!session) return;

              const tokenCost = getGameTokenCost(
                session.mode,
                session.config.quickPlayTopicCount
              );

              // Lock in + spend only once topics are chosen and the board starts.
              let reservationId = entryReservationId;
              if (!authDisabled && isLoaded && isSignedIn) {
                if (!reservationId) {
                  const reservation = await reserveGameEntry(reserveGameEntryMutation, {
                    mode: session.mode,
                    clientSessionId: session.id,
                    cost: tokenCost,
                  });
                  if (!reservation.ok) {
                    showThemedAlert(t('play.needTokens'));
                    return;
                  }
                  reservationId = reservation.reservationId;
                  setEntryReservationId(reservationId);
                }
              }

              const result = startBoard();
              if (!result.ok) {
                if (reservationId && !authDisabled && isLoaded && isSignedIn) {
                  await refundGameEntry(refundEntryMutation, {
                    reservationId,
                    reason: 'start_board_failed',
                  }).catch(() => {});
                  setEntryReservationId(null);
                }
                showThemedAlert(result.error ?? t('play.needTokens'));
                return;
              }

              if (!authDisabled && isLoaded && isSignedIn && reservationId) {
                const consumed = await consumeGameEntry(consumeEntryMutation, {
                  reservationId,
                  completedSessionId: usePlayStore.getState().session?.id ?? '',
                }).catch(() => ({ ok: false as const, error: 'network' }));
                // Only a real balance failure blocks entry; stale reservation states
                // (already consumed/refunded from a previous run) are non-fatal.
                if (!consumed.ok && consumed.error === 'insufficient_balance') {
                  showThemedAlert(t('play.needTokens'));
                  return;
                }
              }

              // Fire-and-forget product analytics: locked-in topics at board start.
              if (!authDisabled && isLoaded && isSignedIn) {
                const locked = usePlayStore.getState().session;
                void recordTopicSelectionMutation({
                  clientSessionId: locked?.id ?? session.id,
                  mode: locked?.mode ?? session.mode,
                  categorySlugs: locked?.selectedCategoryIds ?? session.selectedCategoryIds,
                }).catch(() => {});
              }

              commitEntryCharge();
              setEntryReservationId(null);
              router.replace('/(app)/play/board');
            }}
            style={({ pressed }) => [
              styles.startBtn,
              styles.surfaceRaised,
              SOFT_SURFACE_STYLES.face,
              darkModeFlatTop,
              SOFT_SURFACE_STYLES.raised,
              {
                backgroundColor: studio ? studio.colors.cta : surface,
                opacity: pressed ? 0.92 : 1,
              },
              studio ? softSurfaceLift() : null,
            ]}
          >
            <Text
              style={[
                styles.startBtnText,
                { color: studio ? studio.colors.ctaText : textPrimary },
                studio ? { letterSpacing: studio.type.capsTracking } : null,
              ]}
            >
              {t('play.startBoard').toUpperCase()}
            </Text>
          </Pressable>
        </View>
      )}
    </PlayScaffold>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  compactChrome: {
    // Keep shared HEADER top pad; only tighten bottom on short viewports.
    paddingBottom: 0,
  },
  // ── Header ──────────────────────────────────────────────────────────
  headerWrap: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: HEADER.bottomGap,
    gap: 0,
  },
  headerWrapCompact: {
    paddingTop: 0,
  },
  headerRow: {
    position: 'relative',
    // Title + subtitle stack, so the row must clear both lines.
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerRowCompact: {
    minHeight: 56,
    gap: SPACING.xs,
  },
  headerLeft: {
    zIndex: 2,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  headerCenter: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    paddingHorizontal: SPACING.xs,
  },
  headerRight: {
    zIndex: 2,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 'auto',
  },
  mainTitle: {
    fontFamily: FONTS.displayBold,
    fontSize: FONT_SIZES.lg,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
    maxWidth: '46%',
  },
  mainTitleCompact: {
    fontSize: FONT_SIZES.sm,
    letterSpacing: 1.2,
  },
  subtitle: {
    fontFamily: FONTS.ui,
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.65,
    textAlign: 'center',
    marginTop: 0,
    marginBottom: 0,
  },
  subtitleCompact: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 0,
    marginBottom: 0,
  },
  // ── Header controls (match HeaderBackButton icon / standard raised controls) ──
  counterBadge: {
    height: 44,
    minWidth: 44,
    paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    fontFamily: FONTS.uiBold,
    fontSize: 13,
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  randomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    height: 44,
    minHeight: 44,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.button,
    overflow: 'hidden',
  },
  randomBtnLabel: {
    fontFamily: FONTS.uiSemibold,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  surfaceRaised: {
    borderRadius: BORDER_RADIUS.button,
  },
  // ── Selected strip ───────────────────────────────────────────────────
  selectedStrip: {
    flexGrow: 0,
    flexShrink: 0,
    marginTop: 0,
    marginBottom: SPACING.sm,
  },
  selectedStripContent: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    height: 44,
    minWidth: 0,
  },
  selectedTopicPill: {
    borderRadius: BORDER_RADIUS.button,
    // Equal left/right inset: text starts at 12, X ends at 12 (icon-sized control).
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    minWidth: 0,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'hidden',
  },
  selectedTopicPillCompact: {
    paddingHorizontal: 10,
  },
  selectedPillVeryDense: {
    paddingHorizontal: 8,
    gap: 3,
  },
  /** Label hit target shares the pill row with the remove control (siblings, not nested). */
  selectedPillLabelHit: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    height: '100%',
    justifyContent: 'center',
  },
  selectedPillText: {
    fontFamily: FONTS.uiBold,
    fontSize: 12,
    letterSpacing: 0.3,
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    // Android: avoid extra font padding that unbalances row centering.
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  selectedPillTextDense: {
    fontSize: 11,
  },
  // Icon-sized (not 24px circle) so right edge inset matches left text inset.
  selectedPillClose: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  selectedPillCloseDense: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  // ── Content root ─────────────────────────────────────────────────────
  contentRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Grid container ───────────────────────────────────────────────────
  gridContainer: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  gridScrollContent: {
    paddingBottom: SPACING.xl,
    paddingTop: SPACING.xs,
    width: '100%',
  },
  categoryList: {
    width: '100%',
  },
  listItemWrap: {
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionTitle: {
    alignSelf: 'stretch',
    fontFamily: FONTS.uiBold,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingHorizontal: 2,
  },
  sectionGrid: {
    width: '100%',
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // Full rows fill the column; short final rows stay centered in that same width.
    justifyContent: 'center',
  },
  // ── Topic card ───────────────────────────────────────────────────────
  topicCard: {
    borderRadius: 14,
    overflow: 'hidden',
    // Always reserve selection ring space so toggling never reflows art bounds.
    borderWidth: 1.5,
  },
  cardImageArea: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  missingPictureLabel: {
    fontFamily: FONTS.uiBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  cardTitleBar: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: TOPIC_TITLE_BAR_PAD_V,
    borderTopWidth: TOPIC_TITLE_BAR_BORDER,
  },
  cardTitle: {
    alignSelf: 'center',
    fontFamily: FONTS.uiBold,
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
    textAlignVertical: 'center',
    letterSpacing: 0.3,
    width: '100%',
  },
  selectedBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(51, 51, 51, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  // Android-only dim when at topic cap avoids parent opacity blanking expo-image.
  disabledDim: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.65,
    zIndex: 3,
  },
  // ── Floating action panel ────────────────────────────────────────────
  floatingPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  startBtn: {
    width: '100%',
    maxWidth: 380,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  startBtnText: {
    fontFamily: FONTS.displayBold,
    fontSize: 17,
    letterSpacing: 1.3,
  },
});
