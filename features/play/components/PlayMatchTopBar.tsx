import { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { BackfireTitleLogo } from '@/components/BackfireTitleLogo';
import { Pressable } from '@/components/ui/Pressable';
import { getGameHeaderLogoDisplayWidth } from '@/lib/layout/backfireTitleLogoWidth';
import { SHOW_HOT_SEAT_UI } from '@/constants/featureFlags';
import { FONTS } from '@/constants/theme';
import { useI18n } from '@/lib/i18n/useI18n';
import type { GameSessionState, TeamState } from '@/features/shared';
import { getLeadingTeamId } from '@/features/play/categorySections';
import { getPlaySurfaceColors } from '@/features/play/playSurfaceColors';
import { TickingNumber } from '@/components/studio/TickingNumber';
import { getMatchScorePillMetrics } from '@/features/play/scorePillLayout';
import { usePlayTextScale } from '@/store/display';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';

const WAGER_HEADER_ART = require('@/assets/wager.webp');
const HOT_SEAT_HEADER_ART = require('@/assets/hot-seat.webp');

function isHotSeatConfigured(session: GameSessionState): boolean {
  if (!SHOW_HOT_SEAT_UI) return false;
  const mode = session.config.mode;
  if (mode !== 'classic' && mode !== 'quickPlay') return false;
  return (session.config.hotSeatRounds ?? 0) > 0;
}

/** No remaining Hot Seat rounds (match-level). */
function isHotSeatFullyPlayed(session: GameSessionState): boolean {
  if (!isHotSeatConfigured(session)) return false;
  const hs = session.hotSeat;
  if (!hs?.challenges.length) return false;
  if (hs.activeChallenge) return false;
  return hs.challenges.every((c) => c.completed);
}

function isWagerExhaustedForTeam(team: TeamState, session: GameSessionState): boolean {
  if (!session.config.wagerEnabled) return false;
  return team.wagersUsed >= session.wagersPerTeam;
}

export interface PlayMatchTopBarProps {
  session: GameSessionState;
  onLogoPress: () => void;
  onWagerInfoPress?: () => void;
  onHotSeatInfoPress?: () => void;
  /** Tighter score-card typography when vertical space is tight. Logo width always matches `<GameHeader />`. */
  compact?: boolean;
  /** When false, only the centered BackFire logo is shown unless scorePillsNextToLogo is true. */
  showTeamScores?: boolean;
  scorePillsNextToLogo?: boolean;
}

/**
 * Shared top bar: team scores + wager/hot-seat chips, Backfire wordmark, mirrored team card.
 * Board chrome is the same across modes; multi-team modes only densify pills to fit.
 * Matches `app/(app)/play/board.tsx` game header chrome.
 */
export function PlayMatchTopBar({
  session,
  onLogoPress,
  onWagerInfoPress,
  onHotSeatInfoPress,
  compact,
  showTeamScores = true,
  scorePillsNextToLogo = false,
}: PlayMatchTopBarProps) {
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const playTextScale = usePlayTextScale();
  const adjustScoreByPoints = usePlayStore((state) => state.adjustScoreByPoints);
  // Re-render when palette changes; StyleSheet tokens stay structural-only.
  useThemeStore((state) => state.paletteId);
  const surfaceColors = getPlaySurfaceColors();
  const isRumble = session.mode === 'rumble';
  const compactQuestionHeader = Boolean(compact);
  const multiTeamDensePills = session.teams.length >= 4;
  const shortSide = Math.min(width, height);
  const isTightHeader = compactQuestionHeader && (width < 760 || shortSide < 430);
  const isVeryTightHeader = compactQuestionHeader && shortSide < 390;
  /** Same sizing as home `GameHeader` logoOnly. */
  const logoWidth = getGameHeaderLogoDisplayWidth(width, height);
  const scoreMetrics = useMemo(
    () =>
      getMatchScorePillMetrics({
        width,
        height,
        teamCount: session.teams.length,
        textScale: playTextScale,
      }),
    [height, playTextScale, session.teams.length, width]
  );
  /** Classic side cards still need a width budget when the question header is dense. */
  const sideMaxWidth = compactQuestionHeader
    ? Math.round(scoreMetrics.maxWidth === 9999 ? shortSide * 0.42 : scoreMetrics.maxWidth * 1.05)
    : undefined;
  const showWager = session.config.wagerEnabled && onWagerInfoPress;
  const showHotSeat = isHotSeatConfigured(session) && onHotSeatInfoPress;
  const hotSeatDimmed = isHotSeatFullyPlayed(session);

  const renderIconCluster = (team: TeamState) => {
    if (!showWager && !showHotSeat) return null;

    const wagerDimmed = isWagerExhaustedForTeam(team, session);

    return (
      <View style={styles.headerTeamIconsRow} accessibilityElementsHidden={false}>
        {showWager ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('play.wagerHelpLink')} - ${t('play.wagersUsed', {
              used: team.wagersUsed,
              total: session.wagersPerTeam,
            })}`}
            onPress={onWagerInfoPress}
            style={({ pressed }) => [
              styles.headerIconChip,
              {
                backgroundColor: surfaceColors.iconChipBackground,
                borderColor: surfaceColors.iconChipBorder,
                width: scoreMetrics.iconChip,
                height: scoreMetrics.iconChip,
                borderRadius: scoreMetrics.iconChip / 2,
              },
              wagerDimmed && styles.headerIconChipDimmed,
              pressed && !wagerDimmed && styles.headerFeatureButtonPressed,
            ]}
          >
            <Image
              source={WAGER_HEADER_ART}
              style={[
                styles.headerIconChipImage,
                { width: scoreMetrics.iconImage, height: scoreMetrics.iconImage },
              ]}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </Pressable>
        ) : null}
        {showHotSeat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              hotSeatDimmed
                ? `${t('play.hotSeatInfoLink')} - ${t('play.hotSeatAllRoundsPlayed')}`
                : t('play.hotSeatInfoLink')
            }
            onPress={onHotSeatInfoPress}
            style={({ pressed }) => [
              styles.headerIconChip,
              {
                backgroundColor: surfaceColors.iconChipBackground,
                borderColor: surfaceColors.iconChipBorder,
                width: scoreMetrics.iconChip,
                height: scoreMetrics.iconChip,
                borderRadius: scoreMetrics.iconChip / 2,
              },
              hotSeatDimmed && styles.headerIconChipDimmed,
              pressed && !hotSeatDimmed && styles.headerFeatureButtonPressed,
            ]}
          >
            <Image
              source={HOT_SEAT_HEADER_ART}
              style={[
                styles.headerIconChipImage,
                { width: scoreMetrics.iconImage, height: scoreMetrics.iconImage },
              ]}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderScoreCard = (team: TeamState, alignRight = false) => {
    // Rumble has no rotating turn owner - highlight the sole leader instead.
    const highlightTeamId = isRumble
      ? getLeadingTeamId(session.teams)
      : session.currentTeamId;
    const isActive = highlightTeamId === team.id;
    const useCompactScore = compactQuestionHeader;
    const teamInitial = team.name.trim().charAt(0).toUpperCase() || 'T';
    // Compact question header densifies slightly; still tracks viewport metrics.
    const compactMul = useCompactScore ? (isVeryTightHeader ? 0.82 : isTightHeader ? 0.9 : 0.95) : 1;
    const teamNameFontSize = Math.max(9, Math.round(scoreMetrics.nameFont * (useCompactScore ? 1.05 : 1.15) * compactMul));
    const scoreFontSize = Math.max(11, Math.round(scoreMetrics.scoreFont * compactMul));
    const avatarSize = Math.max(16, Math.round(scoreMetrics.adjustSize * 0.7 * compactMul));

    return (
      <View
        key={team.id}
        style={[
          styles.teamScoreHeader,
          alignRight && styles.teamScoreHeaderRight,
          compactQuestionHeader && { maxWidth: sideMaxWidth },
        ]}
      >
        <View
          style={[
            styles.headerScoreCard,
            {
              backgroundColor: isActive ? surfaceColors.activeTurnFace : surfaceColors.controlBackground,
              borderColor: isActive ? surfaceColors.activeTurnAccent : surfaceColors.hairlineBorder,
              shadowColor: isActive ? surfaceColors.activeTurnAccent : 'transparent',
              gap: Math.round(scoreMetrics.cardGap * compactMul),
              paddingLeft: Math.round(scoreMetrics.cardPaddingLeft * compactMul),
              paddingRight: Math.round(scoreMetrics.cardPaddingRight * compactMul),
              paddingVertical: useCompactScore
                ? Math.max(2, Math.round(scoreMetrics.cardPaddingVertical * 0.45 * compactMul))
                : Math.round(scoreMetrics.cardPaddingVertical * compactMul),
              borderRadius: Math.round(scoreMetrics.cardRadius * compactMul),
              minHeight: useCompactScore
                ? Math.round(scoreMetrics.minHeight * compactMul)
                : undefined,
            },
            isActive && styles.headerScoreCardActive,
          ]}
        >
          <View
            style={[
              styles.headerTeamRow,
              { gap: Math.round(scoreMetrics.cardGap * compactMul) },
            ]}
          >
            <View style={styles.headerTeamNameBlock}>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[
                  styles.headerTeamName,
                  {
                    color: isActive ? surfaceColors.activeTurnOnFace : surfaceColors.textPrimary,
                    fontSize: teamNameFontSize,
                    lineHeight: Math.round(teamNameFontSize * 1.2),
                    fontFamily: useCompactScore || isActive ? FONTS.uiBold : FONTS.uiSemibold,
                  },
                ]}
              >
                {team.name}
              </Text>
            </View>
            <View
              style={[
                styles.headerScoreBadge,
                {
                  backgroundColor: isActive
                    ? surfaceColors.activeTurnNestedFill
                    : useCompactScore
                      ? surfaceColors.controlBackground
                      : surfaceColors.subtleFill,
                  borderColor: isActive ? surfaceColors.activeTurnAccent : surfaceColors.hairlineBorder,
                  minWidth: Math.round(scoreMetrics.badgeMinWidth * compactMul),
                  paddingHorizontal: Math.round(scoreMetrics.badgePadH * compactMul),
                  paddingVertical: useCompactScore
                    ? 0
                    : Math.round(scoreMetrics.badgePadV * compactMul),
                  borderRadius: Math.round(scoreMetrics.badgeRadius * compactMul),
                  height: useCompactScore
                    ? Math.round(scoreMetrics.minHeight * 0.72 * compactMul)
                    : undefined,
                },
              ]}
            >
              <Text
                style={[
                  styles.headerScoreValue,
                  {
                    color: isActive ? surfaceColors.activeTurnOnFace : surfaceColors.textPrimary,
                    fontSize: scoreFontSize,
                    lineHeight: Math.round(scoreFontSize * 1.15),
                  },
                ]}
                numberOfLines={1}
              >
                {team.score}
              </Text>
            </View>
            {useCompactScore ? (
              <View
                style={[
                  styles.teamAvatarMark,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    borderColor: isActive ? surfaceColors.activeTurnAccent : surfaceColors.hairlineBorder,
                    backgroundColor: isActive
                      ? surfaceColors.activeTurnNestedFill
                      : 'rgba(255, 179, 71, 0.16)',
                  },
                ]}
                accessibilityElementsHidden
              >
                <Text
                  style={[
                    styles.teamAvatarInitial,
                    {
                      color: isActive
                        ? surfaceColors.activeTurnOnFace
                        : surfaceColors.textPrimary,
                      fontSize: Math.max(8, Math.round(avatarSize * 0.5)),
                    },
                  ]}
                >
                  {teamInitial}
                </Text>
              </View>
            ) : (
              renderIconCluster(team)
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderLogoScorePill = (team: TeamState) => {
    const highlightTeamId = isRumble ? getLeadingTeamId(session.teams) : session.currentTeamId;
    const isActive = highlightTeamId === team.id;
    const teamCount = session.teams.length;
    /** Six equal pills leave little room, so prefer score digits over name width. */
    const ultraDense = teamCount >= 6;
    // With many equal-width pills, shrink the name before ellipsizing so labels stay readable.
    const nameMinFontScale = ultraDense ? 0.42 : 0.5;
    // Score must never clip: allow aggressive shrink for multi-digit totals on 6-team boards.
    const scoreMinFontScale = ultraDense ? 0.42 : multiTeamDensePills ? 0.55 : 0.7;

    const onFace = surfaceColors.textPrimary;
    const nestedFill = isActive
      ? surfaceColors.activeTurnNestedFill
      : surfaceColors.subtleFill;
    const m = scoreMetrics;

    return (
      <View
        key={team.id}
        testID={`logo-score-pill-${team.id}`}
        style={[
          styles.logoScorePill,
          {
            backgroundColor: surfaceColors.controlBackground,
            borderColor: isActive ? surfaceColors.activeTurnAccent : surfaceColors.hairlineBorder,
            minWidth: m.minWidth > 0 ? m.minWidth : undefined,
            maxWidth: m.maxWidth >= 9999 ? undefined : m.maxWidth,
            minHeight: m.minHeight,
            gap: m.gap,
            paddingHorizontal: m.paddingHorizontal,
            paddingVertical: m.paddingVertical,
            borderRadius: m.borderRadius,
          },
          isRumble && styles.logoScorePillRumble,
          isActive && styles.logoScorePillActive,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${team.name} minus 50`}
          onPress={() => adjustScoreByPoints(team.id, -50, 'board header decrement')}
          style={({ pressed }) => [
            styles.logoScoreAdjust,
            {
              backgroundColor: nestedFill,
              width: m.adjustSize,
              height: m.adjustSize,
              borderRadius: m.adjustRadius,
            },
            pressed && styles.logoScoreAdjustPressed,
          ]}
        >
          <Text
            style={[
              styles.logoScoreAdjustText,
              {
                color: onFace,
                fontSize: m.adjustFont,
                lineHeight: Math.round(m.adjustFont * 1.1),
              },
            ]}
          >
            −
          </Text>
        </Pressable>
        <View style={[styles.logoScoreTextBlock, isRumble && styles.logoScoreTextBlockRumble]}>
          <Text
            style={[
              styles.logoScoreName,
              {
                color: surfaceColors.textMuted,
                fontSize: m.nameFont,
                lineHeight: Math.round(m.nameFont * 1.15),
                maxWidth: isRumble || m.nameMaxWidth == null ? '100%' : m.nameMaxWidth,
                width: isRumble ? '100%' : undefined,
              },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={nameMinFontScale}
            ellipsizeMode="tail"
          >
            {team.name}
          </Text>
          <Text
            testID={`logo-score-value-${team.id}`}
            style={[
              styles.logoScoreValue,
              {
                color: surfaceColors.textPrimary,
                fontSize: m.scoreFont,
                lineHeight: Math.round(m.scoreFont * 1.15),
              },
              isRumble && styles.logoScoreValueRumble,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={scoreMinFontScale}
            // Keep full digits visible; never ellipsize a score number mid-value.
            ellipsizeMode="clip"
          >
            <TickingNumber value={team.score} />
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${team.name} plus 50`}
          onPress={() => adjustScoreByPoints(team.id, 50, 'board header increment')}
          style={({ pressed }) => [
            styles.logoScoreAdjust,
            {
              backgroundColor: nestedFill,
              width: m.adjustSize,
              height: m.adjustSize,
              borderRadius: m.adjustRadius,
            },
            pressed && styles.logoScoreAdjustPressed,
          ]}
        >
          <Text
            style={[
              styles.logoScoreAdjustText,
              {
                color: onFace,
                fontSize: m.adjustFont,
                lineHeight: Math.round(m.adjustFont * 1.1),
              },
            ]}
          >
            +
          </Text>
        </Pressable>
      </View>
    );
  };

  // Board chrome: classic/quick split teams around the logo; Rumble keeps logo left and all scores right.
  if (!showTeamScores) {
    const team0 = session.teams[0];
    const team1 = session.teams[1];
    const extraTeams = session.teams.slice(2);

    if (scorePillsNextToLogo && isRumble) {
      return (
        <View style={[styles.logoOnlyTopBar, styles.logoOnlyTopBarDense, styles.logoOnlyTopBarRumble]}>
          <Pressable
            onPress={onLogoPress}
            style={[styles.headerLogoContainer, { width: logoWidth }]}
            accessibilityRole="button"
            accessibilityLabel={t('play.matchMenuA11y')}
          >
            <BackfireTitleLogo width={logoWidth} accessibilityLabel="BackFire" />
          </Pressable>
          <View
            style={[
              styles.logoScorePills,
              styles.logoScorePillsRumble,
              { gap: scoreMetrics.pillsGap },
            ]}
          >
            {session.teams.map((team) => renderLogoScorePill(team))}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.logoOnlyTopBar, scorePillsNextToLogo && styles.logoOnlyTopBarDense]}>
        {scorePillsNextToLogo && team0 ? (
          <View style={styles.logoScoreSide}>{renderLogoScorePill(team0)}</View>
        ) : null}
        <Pressable
          onPress={onLogoPress}
          style={[styles.headerLogoContainer, { width: logoWidth }]}
          accessibilityRole="button"
          accessibilityLabel={t('play.matchMenuA11y')}
        >
          <BackfireTitleLogo
            width={logoWidth}
            accessibilityLabel="BackFire"
          />
        </Pressable>
        {scorePillsNextToLogo && team1 ? (
          <View style={[styles.logoScoreSide, styles.logoScoreSideRight]}>{renderLogoScorePill(team1)}</View>
        ) : null}
        {scorePillsNextToLogo && extraTeams.length ? (
          <View style={[styles.logoScorePills, { gap: scoreMetrics.pillsGap }]}>
            {extraTeams.map((team) => renderLogoScorePill(team))}
          </View>
        ) : null}
      </View>
    );
  }

  const team0 = session.teams[0];
  const team1 = session.teams[1];
  const extraTeams = session.teams.slice(2);

  const tightTopBarRow = compactQuestionHeader;

  return (
    <View style={[styles.gameTopBar, tightTopBarRow && styles.gameTopBarCompact]}>
      <View style={[styles.topBarSide, tightTopBarRow && styles.topBarSideCompact]}>
        {team0 ? renderScoreCard(team0) : null}
      </View>

      <View style={styles.topBarTitle}>
        <Pressable
          onPress={onLogoPress}
          style={[styles.headerLogoContainer, { width: logoWidth }]}
          accessibilityRole="button"
          accessibilityLabel={t('play.matchMenuA11y')}
        >
          <BackfireTitleLogo width={logoWidth} accessibilityLabel="Backfire" />
        </Pressable>
      </View>

      <View style={[styles.topBarSide, tightTopBarRow && styles.topBarSideCompact, styles.topBarSideRight]}>
        {team1 ? renderScoreCard(team1, true) : null}
      </View>

      {extraTeams.length ? (
        <View style={[styles.logoScorePills, { gap: scoreMetrics.pillsGap }]}>
          {extraTeams.map((team) => renderLogoScorePill(team))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  gameTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    backgroundColor: 'transparent',
    gap: 10,
  },
  gameTopBarCompact: {
    gap: 6,
  },
  logoOnlyTopBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 2,
    overflow: 'visible',
  },
  /**
   * Board score row: slight top pad for amber turn glow and no bottom pad.
   * The topic grid owns equal top/bottom edge cream under the pills.
   */
  logoOnlyTopBarDense: {
    gap: 6,
    paddingTop: 4,
    paddingBottom: 0,
    minHeight: 0,
  },
  /** Rumble: logo anchored left; every team score pill stays to its right. */
  logoOnlyTopBarRumble: {
    justifyContent: 'flex-start',
    gap: 8,
  },
  topBarSide: {
    flex: 1,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  topBarTitle: {
    flexGrow: 0,
    flexShrink: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  topBarSideCompact: {
    alignItems: 'flex-start',
  },
  topBarSideRight: {
    alignItems: 'flex-end',
  },

  logoScorePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  logoScorePillsRumble: {
    flex: 1,
    flexWrap: 'nowrap',
  },
  /** Rumble board: equal flex so N teams fill the header row. */
  logoScorePillRumble: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: 9999,
  },
  logoScoreSide: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  logoScoreSideRight: {
    alignItems: 'flex-end',
  },
  /** Structural only. Sizes come from getMatchScorePillMetrics. */
  logoScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** Theme accent ring for the active team. */
  logoScorePillActive: {
    borderWidth: 2,
  },
  logoScoreAdjust: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoScoreAdjustPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  logoScoreAdjustText: {
    fontFamily: FONTS.displayBold,
  },
  logoScoreTextBlock: {
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  /** Rumble: take remaining width between ± controls so names are not hard-capped. */
  logoScoreTextBlockRumble: {
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 28,
    overflow: 'visible',
  },
  logoScoreName: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
  },
  logoScoreValue: {
    fontFamily: FONTS.displayBold,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  /** Rumble: score claims full text-block width so adjustsFontSizeToFit can shrink. */
  logoScoreValueRumble: {
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
  },
  teamScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  teamScoreHeaderRight: {
    justifyContent: 'flex-end',
  },
  /** Structural only. Padding/radius come from getMatchScorePillMetrics. */
  headerScoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 1,
    borderWidth: StyleSheet.hairlineWidth * 2,
    overflow: 'hidden',
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  headerScoreCardActive: {
    borderWidth: 2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 16,
    elevation: 4,
  },

  headerTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },

  headerTeamIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  headerTeamNameBlock: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 2,
  },
  headerTeamName: {
    fontFamily: FONTS.uiSemibold,
  },
  headerScoreBadge: {
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerScoreValue: {
    fontFamily: FONTS.displayBold,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  teamAvatarMark: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  teamAvatarInitial: {
    fontFamily: FONTS.uiBold,
  },

  headerIconChip: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerIconChipDimmed: {
    opacity: 0.4,
  },
  headerIconChipImage: {},
  headerFeatureButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.96 }],
  },
  headerLogoContainer: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '100%',
  },
});
