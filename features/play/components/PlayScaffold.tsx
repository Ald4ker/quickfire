import { ReactNode } from 'react';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  SPACING,
  BORDER_RADIUS,
  FONT_SIZES,
  getStandardChromeTopPadding,
  getChromeTopPaddingWithInsets,
} from '@/constants';
import { HOME_SOFT_UI } from '@/themes';
import { ScreenContent } from '@/components/ScreenContent';
import { topicCardScreenPadding } from '@/lib/layout/viewportLayout';
import { useI18n } from '@/lib/i18n/useI18n';
import { useTheme } from '@/lib/hooks/useTheme';
import type { GameSessionState } from '@/features/shared';
import { ScoreHud } from './ScoreHud';
import { PlayStackHeader } from './PlayStackHeader';
import { StudioBackdrop } from '@/components/studio/StudioBackdrop';
import type { HeaderBackButtonVariant } from '@/components/HeaderBackButton';

interface PlayScaffoldProps {
  title: string;
  subtitle?: string;
  /** Overrides shell background (e.g. brand cream canvas on team setup). */
  backgroundColor?: string;
  children: ReactNode;
  /** When set, replaces the default `PlayStackHeader` (e.g. full-width play board chrome). */
  customHeader?: ReactNode;
  /** Custom back behavior (e.g. match end → home). Default: stack back or play hub. */
  onBack?: () => void;
  /** Defaults to labeled play pill; use `icon` for settings/store squircle. */
  backVariant?: HeaderBackButtonVariant;
  /** Extra control after the back button (e.g. leading mode chrome). */
  headerLeading?: ReactNode;
  showHud?: boolean;
  /** Tighter score strip (e.g. question board). */
  scoreHudDense?: boolean;
  session?: GameSessionState | null;
  footer?: ReactNode;
  /** Minimal padding and hairline top border - e.g. play board team strip. */
  footerDense?: boolean;
  /**
   * When false, the body is a flex region with no outer scroll - children should size to fit (or use nested scroll).
   */
  bodyScrollEnabled?: boolean;
  /**
   * Wrap body in the bordered card (default). Set false for edge-to-edge content (e.g. topic grid, question board).
   * Applies with both scroll and non-scroll body modes.
   */
  bodyFrame?: boolean;
  /**
   * Drop the body card frame so content fills the shared column under the header.
   * Header and body still share the same horizontal gutter unless
   * `contentSafeAreaHorizontal` is false (match board pads itself).
   */
  bodyEdgeToEdge?: boolean;
  /**
   * When used with `bodyEdgeToEdge`, inset the body and footer horizontally with
   * `max(safe area, screen gutter)` so content clears rounded corners / notches (landscape bezels).
   */
  contentSafeAreaHorizontal?: boolean;
  /**
   * With `bodyEdgeToEdge`, render `footer` between the header chrome and the body (e.g. scores above the board).
   * Ignored when `bodyEdgeToEdge` is false.
   */
  footerAboveBody?: boolean;
  /**
   * Skip the default footer shell (background, top border, outer padding). The footer node owns its own chrome.
   * When `contentSafeAreaHorizontal` + `bodyEdgeToEdge`, only horizontal safe-area gutters wrap the footer.
   */
  footerBare?: boolean;
  /**
   * Override SafeAreaView edges. Defaults: bodyEdgeToEdge → top+bottom; otherwise all sides.
   * Pass e.g. `['bottom']` with a hidden status bar to reclaim top chrome on the board.
   */
  safeAreaEdges?: readonly Edge[];
  /** Merged onto the column that wraps header chrome + body (e.g. zero bottom inset for a flush CTA on phones). */
  chromeColumnStyle?: StyleProp<ViewStyle>;
  /**
   * Max width for the shared header+body column. Pass the same value used by
   * the content row so back / token chip edges align with cards.
   */
  contentMaxWidth?: number;
}

export function PlayScaffold({
  title,
  subtitle,
  backgroundColor,
  children,
  customHeader,
  onBack,
  backVariant,
  headerLeading,
  showHud = false,
  scoreHudDense = false,
  session,
  footer,
  footerDense = false,
  bodyScrollEnabled = true,
  bodyFrame = true,
  bodyEdgeToEdge = false,
  contentSafeAreaHorizontal = false,
  footerAboveBody = false,
  footerBare = false,
  safeAreaEdges,
  chromeColumnStyle,
  contentMaxWidth: _contentMaxWidth,
}: PlayScaffoldProps) {
  const colors = useTheme();
  const shellBackground = backgroundColor ?? HOME_SOFT_UI.colors.canvas;
  const { getTextStyle } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const subtitleTight = windowHeight < 700;
  const isWeb = Platform.OS === 'web';
  const { paddingLeft: padLeft, paddingRight: padRight } = topicCardScreenPadding(
    windowWidth,
    insets,
    isWeb
  );
  /**
   * Prefer topic-card screen padding for horizontal insets on both edge and framed layouts.
   */
  const resolvedSafeAreaEdges: readonly Edge[] =
    safeAreaEdges ??
    (bodyEdgeToEdge
      ? (['top', 'bottom'] as const)
      : (['top', 'bottom'] as const));
  /** Question-screen match: if top safe-area is applied by SafeAreaView, only add standard pad. */
  const chromeTopPad = resolvedSafeAreaEdges.includes('top')
    ? getStandardChromeTopPadding(isWeb)
    : getChromeTopPaddingWithInsets(insets.top, isWeb);

  const contentStyles = [styles.content, styles.contentFit];
  const subtitleStyles = [
    styles.subtitle,
    styles.subtitleFit,
    ...(subtitleTight ? [styles.subtitleTighter] : []),
  ];
  const bodyFillStyles = [
    styles.bodyCard,
    styles.bodyCardFit,
    {
      backgroundColor: colors.cardBackground,
      borderColor: colors.border,
    },
  ];
  const bodyNaturalCardStyles = [
    styles.bodyNaturalCard,
    {
      backgroundColor: colors.cardBackground,
      borderColor: colors.border,
    },
  ];

  const chrome = (
    <>
      {customHeader ?? (
        <PlayStackHeader
          title={title}
          onBackPress={onBack}
          backVariant={backVariant}
          leadingExtra={headerLeading}
          topPad={bodyEdgeToEdge ? 'none' : 'standard'}
        />
      )}

      {customHeader ? null : subtitle ? (
        <Text
          style={[
            ...subtitleStyles,
            { color: colors.textSecondary },
            getTextStyle(undefined, 'body', 'center'),
          ]}
        >
          {subtitle}
        </Text>
      ) : null}

      {customHeader ? null : showHud && session ? (
        <ScoreHud session={session} compact dense={scoreHudDense} />
      ) : null}
    </>
  );

  const bodySection = bodyScrollEnabled ? (
    <View style={bodyFrame ? bodyFillStyles : styles.bodyScrollShellFlush}>
      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        nestedScrollEnabled
      >
        {children}
      </ScrollView>
    </View>
  ) : bodyFrame ? (
    <View style={styles.bodyShellNatural}>
      <View style={[bodyNaturalCardStyles, styles.bodyNaturalCardNoScroll]}>
        {children}
      </View>
    </View>
  ) : (
    <View style={[styles.bodyShellNatural, styles.bodyShellFlush]}>{children}</View>
  );

  /**
   * Header and body share one column (Swift layout-margin pattern).
   * `bodyEdgeToEdge` only drops the body card frame; it does not let chrome
   * outrun the content column. Board opts out of horizontal gutter via
   * `contentSafeAreaHorizontal={false}` and pads itself.
   */
  const applyHorizontalGutter = !bodyEdgeToEdge || contentSafeAreaHorizontal;
  const paddedColumnStyles = bodyEdgeToEdge
    ? [
        styles.sharedEdgeColumn,
        {
          paddingTop: chromeTopPad,
          paddingBottom: SPACING.xs,
          ...(applyHorizontalGutter ? { paddingLeft: padLeft, paddingRight: padRight } : null),
        },
      ]
    : [
        ...contentStyles,
        {
          paddingLeft: padLeft,
          paddingRight: padRight,
        },
      ];

  const footerPlacementAbove = Boolean(footer && bodyEdgeToEdge && footerAboveBody);

  const footerChromeStyles = [
    styles.footer,
    footerDense ? styles.footerDense : styles.footerFit,
    contentSafeAreaHorizontal && bodyEdgeToEdge && !footerPlacementAbove && {
      paddingLeft: padLeft,
      paddingRight: padRight,
    },
    {
      backgroundColor: shellBackground,
      borderTopColor: colors.border,
    },
    footerPlacementAbove && {
      borderTopWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    footerPlacementAbove && styles.footerSlotFixed,
  ];

  const footerHorizontalGutter =
    footerBare && contentSafeAreaHorizontal && bodyEdgeToEdge && !footerPlacementAbove
      ? { paddingLeft: padLeft, paddingRight: padRight }
      : null;

  const footerShell =
    footer ? (
      footerBare ? (
        footerHorizontalGutter ? (
          <View style={[footerHorizontalGutter, footerPlacementAbove && styles.footerSlotFixed]}>{footer}</View>
        ) : footerPlacementAbove ? (
          <View style={styles.footerSlotFixed}>{footer}</View>
        ) : (
          footer
        )
      ) : (
        <View style={footerChromeStyles}>{footer}</View>
      )
    ) : null;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: shellBackground }]}
      edges={resolvedSafeAreaEdges}
    >
      <StudioBackdrop />
      <ScreenContent fullWidth style={styles.screenInner}>
        <View style={styles.fitRoot}>
          <View style={[paddedColumnStyles, chromeColumnStyle]}>
            {chrome}
            {footerPlacementAbove ? footerShell : null}
            {bodySection}
          </View>
        </View>
      </ScreenContent>

      {footer && !footerPlacementAbove ? footerShell : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screenInner: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  fitRoot: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  contentFit: {
    flex: 1,
    paddingTop: 0,
    // Horizontal padding applied inline via topic-card screen padding.
    paddingBottom: SPACING.xs,
    minHeight: 0,
  },
  /** Centered column for header + body when `contentMaxWidth` is set. */
  contentFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    minWidth: 0,
    minHeight: 0,
  },
  /** Header + body in one column. Top pad applied via getStandardChromeTopPadding. */
  sharedEdgeColumn: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  /** Keeps team strip / footer from collapsing when the board body fights for height. */
  footerSlotFixed: {
    flexGrow: 0,
    flexShrink: 0,
  },
  subtitle: {
    fontSize: FONT_SIZES.md,
    lineHeight: 22,
    marginBottom: SPACING.md,
    textAlign: 'center',
    paddingHorizontal: SPACING.sm,
  },
  subtitleFit: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 18,
    marginBottom: SPACING.sm,
  },
  subtitleTighter: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
    marginBottom: SPACING.xs,
  },
  bodyCard: {
    borderWidth: 2,
    borderRadius: BORDER_RADIUS.xl,
    borderStyle: 'solid',
    overflow: 'hidden',
    padding: SPACING.lg,
  },
  bodyCardFit: {
    flex: 1,
    minHeight: 0,
    padding: SPACING.sm,
  },
  /** Scroll body without bordered card - same flex contract as `bodyCard` + `bodyCardFit`. */
  bodyScrollShellFlush: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    overflow: 'hidden',
  },
  /** Fills space under header/subtitle; ScrollView inside clips and scrolls. */
  bodyShellNatural: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  /** No-scroll body without inner card - children sit on shell background. */
  bodyShellFlush: {
    overflow: 'hidden',
    width: '100%',
    alignSelf: 'stretch',
  },
  /** Fills middle region; children use flex to distribute space (no body scroll). */
  bodyNaturalCardNoScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  bodyNaturalCard: {
    borderWidth: 2,
    borderRadius: BORDER_RADIUS.xl,
    borderStyle: 'solid',
    overflow: 'hidden',
    padding: SPACING.sm,
    width: '100%',
    gap: SPACING.sm,
  },
  bodyScroll: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  bodyScrollContent: {
    flexGrow: 1,
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  footer: {
    borderTopWidth: 2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  footerFit: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  footerDense: {
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
