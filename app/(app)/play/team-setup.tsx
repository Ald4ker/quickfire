import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from '@/components/ui/Pressable';
import { useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { COLORS, FONT_SIZES, FONTS, SPACING, getStandardChromeTopPadding } from '@/constants';
import { SHOW_HOT_SEAT_UI } from '@/constants/featureFlags';
import { PlayScaffold } from '@/features/play/components/PlayScaffold';
import { WagerInfoModal } from '@/features/play/components/WagerInfoModal';
import { WebAwareModal } from '@/components/WebAwareModal';
import { isActiveMatchStep, routeForPlayStep } from '@/features/play/sessionRouting';
import {
  RUMBLE_TEAM_COUNT_OPTIONS,
  RUMBLE_TOPIC_COUNT_OPTIONS,
  isRumbleTeamCountAllowed,
  normalizeRumbleTopicCount,
  type RumbleTopicCount,
} from '@/features/play/rumble';
import { getModeCategoryCount } from '@/features/play/data';
import { SOFT_SURFACE_FACE, softSurfaceLift } from '@/features/play/styles/softSurface';
import { getGameTokenCost } from '@/features/play/tokenCosts';
import { useI18n } from '@/lib/i18n/useI18n';
import { useDarkModeFlatTop } from '@/lib/hooks/useTheme';
import { useViewportLayout } from '@/lib/hooks/useViewportLayout';
import {
  getTeamSetupClassicBodyLayout,
  getWebTeamCardMinHeight,
} from '@/lib/layout/teamSetupLayout';
import { goBackOrReplace } from '@/lib/navigation/goBackOrReplace';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import type { GameSessionState } from '@/features/shared';
import { HOME_SOFT_UI } from '@/themes';

const T = HOME_SOFT_UI.colors;

/** Deeper drop shadow - reads as a raised plastic tile (tier scales with control size). */
function neumorphicLift(
  shadowColor: string,
  _tier: 'hero' | 'header' | 'pill' | 'card'
): ViewStyle {
  return {
    ...softSurfaceLift(),
    shadowColor,
  };
}

/** Light top lip + soft bottom edge - reads extruded on white squircles. */
const PLASTIC_FACE: ViewStyle = {
  ...SOFT_SURFACE_FACE,
};
const RUMBLE_TOPIC_LABEL_KEYS = {
  3: 'play.rumbleTopicCount.3',
  4: 'play.rumbleTopicCount.4',
  6: 'play.rumbleTopicCount.6',
} as const satisfies Record<RumbleTopicCount, string>;
const MAX_WAGERS_PER_TEAM = 9;
const MAX_HOT_SEAT_ROUNDS = 5;

const WAGER_CARD_ICON = require('@/assets/wager.webp');
const HOT_SEAT_CARD_ICON = require('@/assets/hot-seat.webp');

/** Scales rumble team-setup panel so it fits phone landscape and narrow web widths. */
function getRumbleTeamSetupDensity(windowWidth: number, windowHeight: number) {
  const shortSide = Math.min(windowWidth, windowHeight);
  const tight = shortSide < 400;
  const micro = shortSide < 360;
  const horizontalGutter = micro ? 10 : tight ? 14 : 18;

  return {
    horizontalGutter,
    panelPadH: micro ? SPACING.sm : tight ? SPACING.sm + 2 : SPACING.md,
    panelPadV: micro ? SPACING.sm : SPACING.md,
    panelGap: tight ? SPACING.sm : SPACING.md,
    panelRadius: tight ? 14 : 18,
    panelMaxWidth: Math.min(620, Math.max(260, windowWidth - horizontalGutter * 2)),
    cardHeadingSize: micro ? FONT_SIZES.xs : tight ? FONT_SIZES.sm : FONT_SIZES.md,
    nameMinH: micro ? 36 : tight ? 40 : 46,
    nameFontSize: tight ? FONT_SIZES.sm : FONT_SIZES.md,
    namePadH: tight ? SPACING.sm : SPACING.md,
    gridRowGap: micro ? 6 : tight ? SPACING.xs : SPACING.sm,
    gridColGap: micro ? 6 : tight ? SPACING.xs : SPACING.sm,
    /** Perfect circles for 2 / 3 / 4 / 6 (guide). */
    countSize: micro ? 36 : tight ? 40 : 44,
    countGap: micro ? SPACING.xs : tight ? SPACING.sm : SPACING.md,
    countFontSize: tight ? FONT_SIZES.sm : FONT_SIZES.md,
    topicTabMinH: micro ? 32 : tight ? 36 : 40,
    topicTabFontSize: micro ? FONT_SIZES.xs : tight ? FONT_SIZES.sm : FONT_SIZES.md,
    topicTabGap: micro ? 6 : tight ? SPACING.xs : SPACING.sm,
    editIcon: micro ? 12 : tight ? 13 : 15,
    /** Air between name grid and count row (guide: generous). */
    nameToCountGap: micro ? SPACING.sm : tight ? SPACING.md : SPACING.lg,
  };
}

function hotSeatRoundsFromConfig(team: GameSessionState['config']): number {
  if (team.hotSeatRounds !== undefined) return team.hotSeatRounds;
  return team.hotSeatEnabled ? 1 : 0;
}

export default function TeamSetupScreen() {
  const router = useRouter();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const viewport = useViewportLayout();
  const compact = viewport.isCompact || windowWidth < 340;
  const shortScreen = !viewport.isTall;
  const landscape = windowWidth > windowHeight;
  const shortSide = viewport.shortSide;
  /** Phones / mobile web narrow view - denser Continue strip (still keeps bottom inset). */
  const tightContinueStrip =
    Platform.OS === 'ios' || Platform.OS === 'android' || shortSide < 560;
  /** Desktop web: three-column balanced layout with constrained panel widths. */
  const isWebLayout = Platform.OS === 'web' && viewport.isWide;
  const viewportScale = viewport.scale;
  const setupRowMaxWidth = viewport.contentMaxWidth('playWide');
  const classicBodyLayout = useMemo(
    () =>
      getTeamSetupClassicBodyLayout({
        isWebLayout,
        mainJustify: viewport.mainJustify,
        setupRowMaxWidth,
      }),
    [isWebLayout, setupRowMaxWidth, viewport.mainJustify]
  );
  /** Wide web: cards fill most of the viewport height (not a short centered strip). */
  const webTeamCardMinHeight = useMemo(
    () => getWebTeamCardMinHeight(windowHeight),
    [windowHeight]
  );
  const { getTextStyle, t } = useI18n();
  const paletteId = useThemeStore((state) => state.paletteId);
  const themedStyles = useMemo(() => makeThemedStyles(paletteId), [paletteId]);
  const darkModeFlatTop = useDarkModeFlatTop();
  const [wagerInfoOpen, setWagerInfoOpen] = useState(false);
  const [hotSeatInfoOpen, setHotSeatInfoOpen] = useState(false);
  const [topicPickerOpen, setTopicPickerOpen] = useState(false);

  const session = usePlayStore((state) => state.session);
  const ensureDraft = usePlayStore((state) => state.ensureDraft);
  const updateTeamName = usePlayStore((state) => state.updateTeamName);
  const addTeamMember = usePlayStore((state) => state.addTeamMember);
  const removeTeamMember = usePlayStore((state) => state.removeTeamMember);
  const updateTeamMemberName = usePlayStore((state) => state.updateTeamMemberName);
  const setTeamCount = usePlayStore((state) => state.setTeamCount);
  const setTopicCount = usePlayStore((state) => state.setTopicCount);
  const setWagersPerTeam = usePlayStore((state) => state.setWagersPerTeam);
  const setHotSeatRounds = usePlayStore((state) => state.setHotSeatRounds);

  // Browser/history back can reopen setup while a match is live - return to the leave-capable match UI.
  useEffect(() => {
    const step = session?.step;
    if (!isActiveMatchStep(step) || !step) return;
    const target = routeForPlayStep(step);
    if (target) {
      router.replace(target);
    }
  }, [router, session?.step]);

  const handleBack = useCallback(() => {
    // Quick Play enters team setup from topic length; other modes enter from home.
    if (session?.mode === 'quickPlay') {
      goBackOrReplace(router, '/play/quick-length');
      return;
    }
    goBackOrReplace(router, '/(app)/');
  }, [router, session?.mode]);

  const canContinue = Boolean(
    session?.teams.every(
      (team) =>
        team.name.trim().length > 0 &&
        (team.playerNames?.length ?? 0) > 0 &&
        team.playerNames?.every((player) => player.trim().length > 0)
    )
  );

  const wagerEnabled = session?.config.wagerEnabled ?? false;
  const hotSeatAvailable = Boolean(
    session && SHOW_HOT_SEAT_UI && (session.mode === 'classic' || session.mode === 'quickPlay')
  );
  const rumbleMode = session?.mode === 'rumble';
  const randomMode = session?.mode === 'random';
  const rumbleTopicCount = rumbleMode
    ? normalizeRumbleTopicCount(session?.config.quickPlayTopicCount)
    : 6;
  const randomTopicCount = randomMode
    ? getModeCategoryCount('random', session?.config.quickPlayTopicCount)
    : 6;
  const randomTokenCost = randomMode ? getGameTokenCost('random', randomTopicCount) : 0;
  const tokensLabel = t('common.tokens').toUpperCase();
  const hotSeatRounds = session ? hotSeatRoundsFromConfig(session.config) : 0;

  const topicPickerLayout = useMemo(() => {
    const shortSide = Math.min(windowWidth, windowHeight);
    const tight = shortSide < 400;
    const micro = shortSide < 360;
    const overlayPad = Math.max(SPACING.sm, Math.round((micro ? 8 : tight ? 12 : 16) * viewportScale));
    // Prefer filling the viewport width so six tiles stay as wide as possible.
    const sheetMaxWidth = Math.min(
      windowWidth - overlayPad * 2,
      landscape ? Math.min(720, Math.round(windowWidth * 0.9)) : Math.min(480, Math.round(windowWidth * 0.96))
    );
    const sheetPad = Math.round((micro ? SPACING.sm : tight ? SPACING.md : SPACING.md + 4) * viewportScale);
    const gap = Math.max(4, Math.round((micro ? 4 : tight ? 6 : 8) * viewportScale));
    const optionWidth = Math.max(
      48,
      Math.floor((sheetMaxWidth - sheetPad * 2 - gap * 5) / 6)
    );
    const optionHeight = Math.max(
      Math.round(optionWidth * (landscape ? 1.35 : 1.45)),
      Math.round((micro ? 72 : tight ? 82 : 92) * viewportScale)
    );
    return {
      overlayPad,
      sheetMaxWidth,
      sheetPad,
      gap,
      optionWidth,
      optionHeight,
      titleSize: Math.round((micro ? 14 : tight ? 16 : 18) * viewportScale),
      optionFontSize: Math.round((micro ? 22 : tight ? 26 : 30) * viewportScale),
      tokenCostSize: Math.round((micro ? 11 : tight ? 12 : 13) * viewportScale),
      tokenWordSize: Math.round((micro ? 7 : tight ? 8 : 9) * viewportScale),
      tokenIconSize: Math.round((micro ? 10 : tight ? 11 : 12) * viewportScale),
      sheetRadius: Math.round((tight ? 28 : 36) * viewportScale),
      optionRadius: Math.round(Math.min(optionWidth * 0.36, tight ? 18 : 22)),
      maxSheetHeight: Math.round(windowHeight * (landscape ? 0.92 : 0.76)),
      titleMargin: Math.round((tight ? 4 : 8) * viewportScale),
    };
  }, [landscape, viewportScale, windowHeight, windowWidth]);

  useLayoutEffect(() => {
    ensureDraft();
  }, [ensureDraft]);

  const inputMinH = Math.round((shortScreen ? 26 : compact ? 32 : 40) * viewportScale);
  const inputFontSize = Math.round((shortScreen ? FONT_SIZES.xs : compact ? FONT_SIZES.sm : FONT_SIZES.md) * viewportScale);
  const stepperBtn = Math.round((shortScreen ? 34 : compact ? 38 : 42) * viewportScale);
  const stepperValueSize = Math.round((shortScreen ? 18 : compact ? 20 : 24) * viewportScale);
  const topicCountBoxSize = Math.round((shortScreen ? 52 : compact ? 56 : 64) * viewportScale);
  const cardPad = Math.round((shortScreen ? SPACING.sm : SPACING.md) * viewportScale);
  const centerTitleSize = Math.round((shortScreen ? 14 : FONT_SIZES.lg) * viewportScale);
  const centerIconSize = Math.round((shortScreen ? 40 : 64) * viewportScale);

  const rumbleDensity = useMemo(
    () => getRumbleTeamSetupDensity(windowWidth, windowHeight),
    [windowWidth, windowHeight]
  );

  const renderStepper = useCallback(
    (value: number, onMinus: () => void, onPlus: () => void, minusDisabled: boolean, plusDisabled: boolean) => (
      <View style={[styles.stepperRow, { gap: shortScreen ? SPACING.md : SPACING.lg }]}>
        <Pressable
          style={({ pressed }) => [
            styles.stepperButton,
            themedStyles.stepperButton,
            { width: stepperBtn, height: stepperBtn, opacity: minusDisabled ? 0.4 : pressed ? 0.92 : 1 },
            neumorphicLift(T.shadowStrong, 'header'),
          ]}
          onPress={onMinus}
          disabled={minusDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: minusDisabled }}
        >
          <Text style={[styles.stepperGlyph, themedStyles.stepperGlyph]}>−</Text>
        </Pressable>
        <Text style={[styles.stepperValue, themedStyles.stepperValue, { fontSize: stepperValueSize }, getTextStyle(undefined, 'displayBold', 'center')]}>
          {value}
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.stepperButton,
            themedStyles.stepperButton,
            { width: stepperBtn, height: stepperBtn, opacity: plusDisabled ? 0.4 : pressed ? 0.92 : 1 },
            neumorphicLift(T.shadowStrong, 'header'),
          ]}
          onPress={onPlus}
          disabled={plusDisabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: plusDisabled }}
        >
          <Text style={[styles.stepperGlyph, themedStyles.stepperGlyph]}>+</Text>
        </Pressable>
      </View>
    ),
    [getTextStyle, stepperBtn, stepperValueSize, shortScreen, themedStyles]
  );

  const teamCard = (team: GameSessionState['teams'][number]) => {
    const memberCount = team.playerNames?.length ?? 0;
    return (
      <View
        testID="team-setup-team-card"
        style={[
          styles.teamCard,
          themedStyles.teamCard,
          { padding: cardPad },
          // Wide web: tall cards (player list flexes to fill), not content-hug strips.
          isWebLayout && [styles.webTeamCardTall, { minHeight: webTeamCardMinHeight }],
        ]}
      >
        <View style={styles.editableInputWrap}>
          <TextInput
            value={team.name}
            onChangeText={(value) => updateTeamName(team.id, value)}
            style={[
              styles.teamTitleInput,
              themedStyles.teamTitleInput,
              // Symmetric pad so centered title lines up with Add Player (not left-shifted by icon pad).
              styles.inputWithEditIcon,
              styles.teamTitleInputIconPad,
              { fontSize: shortScreen ? 18 : compact ? 20 : 22 },
              shortScreen && styles.teamTitleInputTight,
              getTextStyle(undefined, 'display', 'center'),
            ]}
            placeholder={t('play.teamNamePlaceholder')}
            placeholderTextColor={T.textMuted}
            accessibilityLabel={t('play.teamNamePlaceholder')}
          />
          <View style={styles.editIconWrap} pointerEvents="none" accessible={false}>
            <Ionicons name="create-outline" size={14} color={T.textMuted} />
          </View>
        </View>

        <View style={styles.teamPlayerList}>
          {(team.playerNames ?? []).map((player, index) => (
            <View key={`${team.id}-${index}`} style={styles.playerRowSlot}>
              <View style={styles.editableInputWrap}>
                <TextInput
                  value={player}
                  onChangeText={(value) => updateTeamMemberName(team.id, index, value)}
                  multiline={false}
                  style={[
                    styles.playerInput,
                    themedStyles.playerInput,
                    styles.inputWithEditIcon,
                    {
                      minHeight: inputMinH,
                      fontSize: inputFontSize,
                    },
                    getTextStyle(),
                  ]}
                  placeholder={t('play.playerPlaceholder', { count: index + 1 })}
                  placeholderTextColor={T.textMuted}
                  accessibilityLabel={`${team.id} ${t('play.playerPlaceholder', { count: index + 1 })}`}
                />
                <View style={styles.editIconWrap} pointerEvents="none" accessible={false}>
                  <Ionicons name="create-outline" size={14} color={T.textMuted} />
                </View>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.teamLinksRow, shortScreen && styles.teamLinksRowTight]}>
          {memberCount > 1 ? (
            <Pressable
              onPress={() => removeTeamMember(team.id)}
              style={({ pressed }) => [
                styles.playerActionButton,
                styles.removePlayerAction,
                themedStyles.removePlayerAction,
                pressed && styles.playerActionPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('play.removeTeamMemberA11y')}
            >
              <Text style={[styles.removePlayerActionText, themedStyles.removePlayerActionText, getTextStyle()]}>
                {t('play.removeLastPlayerLink')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => addTeamMember(team.id)}
            style={({ pressed }) => [
              styles.playerActionButton,
              styles.addPlayerAction,
              themedStyles.addPlayerAction,
              pressed && styles.playerActionPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t('play.addTeamMemberA11y')}
          >
            <Text style={[styles.addPlayerActionText, themedStyles.addPlayerActionText, getTextStyle()]}>{t('play.addPlayerLink')}</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const rumbleTeamsPanel = useMemo(() => {
    if (!session || !rumbleMode) return null;

    const d = rumbleDensity;
    const namesGridMinHeight = d.nameMinH * 3 + d.gridRowGap * 2;

    return (
      <View
        style={[
          styles.rumblePanel,
          themedStyles.rumblePanel,
          {
            maxWidth: d.panelMaxWidth,
            paddingHorizontal: d.panelPadH,
            paddingTop: tightContinueStrip ? SPACING.xs : d.panelPadV,
            paddingBottom: tightContinueStrip ? SPACING.xs : d.panelPadV,
            gap: d.panelGap,
            borderRadius: d.panelRadius,
          },
        ]}
      >
        <View style={[styles.rumbleTopicTabRow, { gap: d.topicTabGap }]}>
          {RUMBLE_TOPIC_COUNT_OPTIONS.map((count) => {
            const selected = rumbleTopicCount === count;
            return (
              <Pressable
                key={count}
                onPress={() => setTopicCount(count)}
                style={({ pressed }) => [
                  styles.rumbleTopicTab,
                  {
                    minHeight: d.topicTabMinH,
                    borderRadius: 14,
                  },
                  themedStyles.rumbleCountButton,
                  selected && styles.rumbleCountButtonSelected,
                  selected && themedStyles.rumbleCountButtonSelected,
                  pressed && styles.rumbleCountButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t(RUMBLE_TOPIC_LABEL_KEYS[count])}
                accessibilityState={{ selected }}
              >
                <Text
                  style={[
                    styles.rumbleTopicTabText,
                    themedStyles.rumbleCountText,
                    { fontSize: d.topicTabFontSize },
                    selected && styles.rumbleCountTextSelected,
                    selected && themedStyles.rumbleCountTextSelected,
                    getTextStyle(undefined, 'displayBold', 'center'),
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {t(RUMBLE_TOPIC_LABEL_KEYS[count])}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          testID="rumble-names-grid"
          style={[
            styles.rumbleNamesGrid,
            {
              rowGap: d.gridRowGap,
              columnGap: d.gridColGap,
              minHeight: namesGridMinHeight,
            },
          ]}
        >
          {session.teams.map((team) => (
            <View
              key={team.id}
              style={[
                styles.rumbleNameRow,
                { minHeight: d.nameMinH },
              ]}
            >
              <View style={styles.editableInputWrap}>
                <TextInput
                  value={team.name}
                  onChangeText={(value) => updateTeamName(team.id, value)}
                  style={[
                    styles.rumbleNameInput,
                    themedStyles.rumbleNameInput,
                    styles.inputWithEditIcon,
                    {
                      minHeight: d.nameMinH,
                      fontSize: d.nameFontSize,
                      paddingHorizontal: d.namePadH,
                      borderRadius: 14,
                    },
                    getTextStyle(),
                  ]}
                  placeholder={t('play.teamNamePlaceholder')}
                  placeholderTextColor={T.textMuted}
                  accessibilityLabel={t('play.teamNamePlaceholder')}
                  numberOfLines={1}
                />
                <View style={styles.editIconWrap} pointerEvents="none" accessible={false}>
                  <Ionicons name="create-outline" size={d.editIcon} color={T.textMuted} />
                </View>
              </View>
            </View>
          ))}
        </View>

        <Text
          style={[
            styles.rumbleCardHeading,
            themedStyles.rumbleCardHeading,
            { fontSize: d.cardHeadingSize },
            getTextStyle(undefined, 'displayBold', 'center'),
          ]}
        >
          {t('play.rumblePartyCountTitle').toUpperCase()}
        </Text>

        <View
          style={[
            styles.rumblePanelCountRow,
            {
              gap: d.countGap,
            },
          ]}
        >
          {RUMBLE_TEAM_COUNT_OPTIONS.map((count) => {
            const selected = session.teams.length === count;
            const allowed = isRumbleTeamCountAllowed(rumbleTopicCount, count);
            return (
              <Pressable
                key={count}
                onPress={() => setTeamCount(count)}
                disabled={!allowed}
                style={({ pressed }) => [
                  styles.rumbleCountButton,
                  {
                    width: d.countSize,
                    height: d.countSize,
                    borderRadius: 14,
                    opacity: allowed ? 1 : 0.35,
                  },
                  themedStyles.rumbleCountButton,
                  selected && allowed && styles.rumbleCountButtonSelected,
                  selected && allowed && themedStyles.rumbleCountButtonSelected,
                  pressed && allowed && styles.rumbleCountButtonPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${count} teams`}
                accessibilityState={{ selected, disabled: !allowed }}
              >
                <Text
                  style={[
                    styles.rumbleCountText,
                    themedStyles.rumbleCountText,
                    { fontSize: d.countFontSize },
                    selected && allowed && styles.rumbleCountTextSelected,
                    selected && allowed && themedStyles.rumbleCountTextSelected,
                    getTextStyle(undefined, 'displayBold', 'center'),
                  ]}
                >
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }, [rumbleDensity, rumbleTopicCount, session, rumbleMode, getTextStyle, setTeamCount, setTopicCount, t, themedStyles, tightContinueStrip, updateTeamName]);

  const centerColumn = useMemo(() => {
    if (!session) return null;
    const isBothCenter = hotSeatAvailable && wagerEnabled;
    const stackStyle = landscape 
      ? styles.centerStackLandscape 
      : [styles.centerStackPortrait, isBothCenter && shortScreen && styles.centerStackPortraitCompact];
    const gap = shortScreen ? SPACING.xs : SPACING.md;
    return (
      <View style={[stackStyle, { gap }]}>
        {hotSeatAvailable ? (
          <View style={[
            styles.centerCard,
            themedStyles.centerCard,
            shortScreen && styles.centerCardTight,
            isBothCenter && shortScreen && styles.centerCardHalfWidth,
            { padding: cardPad }
          ]}>
            <Image
              source={HOT_SEAT_CARD_ICON}
              style={{ width: centerIconSize, height: centerIconSize }}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessible={false}
            />
            <Text style={[styles.centerCardTitle, themedStyles.centerCardTitle, { fontSize: centerTitleSize }, getTextStyle(undefined, 'display', 'center')]}>
              {t('play.hotSeatTitle')}
            </Text>
            {renderStepper(
              hotSeatRounds,
              () => setHotSeatRounds(hotSeatRounds - 1),
              () => setHotSeatRounds(hotSeatRounds + 1),
              hotSeatRounds <= 0,
              hotSeatRounds >= MAX_HOT_SEAT_ROUNDS
            )}
            <Pressable onPress={() => setHotSeatInfoOpen(true)} style={styles.helpHit} accessibilityRole="button">
              <Text style={[styles.linkText, themedStyles.linkText, getTextStyle()]}>{t('play.hotSeatInfoLink')}</Text>
            </Pressable>
          </View>
        ) : null}

        {wagerEnabled ? (
          <View style={[
            styles.centerCard,
            themedStyles.centerCard,
            shortScreen && styles.centerCardTight,
            isBothCenter && shortScreen && styles.centerCardHalfWidth,
            { padding: cardPad }
          ]}>
            <Image
              source={WAGER_CARD_ICON}
              style={{ width: centerIconSize, height: centerIconSize }}
              contentFit="contain"
              cachePolicy="memory-disk"
              accessible={false}
            />
            <Text style={[styles.centerCardTitle, themedStyles.centerCardTitle, { fontSize: centerTitleSize }, getTextStyle(undefined, 'display', 'center')]}>
              {t('play.wagerCardTitle')}
            </Text>
            {renderStepper(
              session.wagersPerTeam,
              () => setWagersPerTeam(session.wagersPerTeam - 1),
              () => setWagersPerTeam(session.wagersPerTeam + 1),
              session.wagersPerTeam <= 0,
              session.wagersPerTeam >= MAX_WAGERS_PER_TEAM
            )}
            <Pressable
              onPress={() => setWagerInfoOpen(true)}
              style={styles.helpHit}
              accessibilityRole="button"
            >
              <Text style={[styles.linkText, themedStyles.linkText, getTextStyle(undefined, 'bodySemibold')]}>{t('play.wagerHelpLink')}</Text>
            </Pressable>
          </View>
        ) : null}

        {randomMode ? (
          <View
            style={[
              styles.centerCard,
              themedStyles.centerCard,
              shortScreen && styles.centerCardTight,
              { padding: cardPad },
            ]}
            testID="random-topic-count-card"
          >
            <Text
              style={[
                styles.centerCardTitle,
                themedStyles.centerCardTitle,
                { fontSize: centerTitleSize },
                getTextStyle(undefined, 'display', 'center'),
              ]}
            >
              {t('play.numberOfTopics')}
            </Text>
            <Pressable
              testID="random-topic-count-box"
              onPress={() => setTopicPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t('play.numberOfTopicsA11y', {
                count: randomTopicCount,
                cost: randomTokenCost,
              })}
              style={({ pressed }) => [
                styles.topicCountTile,
                SOFT_SURFACE_FACE,
                darkModeFlatTop,
                {
                  marginTop: SPACING.sm,
                  minWidth: Math.round(topicCountBoxSize * 1.55),
                  paddingHorizontal: Math.round((SPACING.md + 2) * viewportScale),
                  paddingTop: Math.round((SPACING.md + 2) * viewportScale),
                  paddingBottom: Math.round((SPACING.md + 2) * viewportScale),
                  borderRadius: Math.round(topicCountBoxSize * 0.34),
                  backgroundColor: T.canvas,
                  opacity: pressed ? 0.94 : 1,
                  transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                },
              ]}
            >
              <Text
                style={[
                  styles.topicCountBoxValue,
                  {
                    fontSize: Math.round(stepperValueSize * 1.15),
                    lineHeight: Math.round(stepperValueSize * 1.15),
                    color: T.textPrimary,
                    includeFontPadding: false,
                  },
                  getTextStyle(undefined, 'displayBold', 'center'),
                ]}
                numberOfLines={1}
              >
                {randomTopicCount}
              </Text>
              <View
                style={styles.topicTokenCostRow}
                testID="random-topic-token-cost"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                <Ionicons
                  name="diamond"
                  size={Math.max(11, Math.round(stepperValueSize * 0.48))}
                  color={T.textPrimary}
                />
                <Text
                  style={[
                    styles.topicTokenCostText,
                    {
                      color: T.textPrimary,
                      fontSize: Math.max(10, Math.round(centerTitleSize * 0.68)),
                      lineHeight: Math.max(12, Math.round(centerTitleSize * 0.68)),
                      includeFontPadding: false,
                    },
                    getTextStyle(undefined, 'bodySemibold', 'center'),
                  ]}
                  numberOfLines={1}
                >
                  {`${randomTokenCost} ${tokensLabel}`}
                </Text>
              </View>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  }, [
    session,
    wagerEnabled,
    hotSeatAvailable,
    hotSeatRounds,
    randomMode,
    randomTopicCount,
    randomTokenCost,
    tokensLabel,
    renderStepper,
    setHotSeatRounds,
    setWagersPerTeam,
    t,
    getTextStyle,
    landscape,
    shortScreen,
    cardPad,
    centerIconSize,
    centerTitleSize,
    topicCountBoxSize,
    stepperValueSize,
    viewportScale,
    darkModeFlatTop,
    themedStyles,
  ]);

  if (!session) {
    return (
      <PlayScaffold title={t('common.loading')} bodyScrollEnabled={false} backgroundColor={T.canvas}>
        <Text style={{ color: T.textPrimary }}>{t('common.loading')}</Text>
      </PlayScaffold>
    );
  }

  const continueControls = (
    <>
      <Button
        title={t('common.continue').toUpperCase()}
        onPress={() => router.push('/play/categories')}
        disabled={!canContinue}
        style={StyleSheet.flatten([
          styles.continueBtn,
          themedStyles.continueBtn,
          isWebLayout && styles.webContinueBtn,
          !canContinue && { opacity: 0.5 },
        ])}
        textStyle={StyleSheet.flatten([
          styles.continueBtnText,
          themedStyles.continueBtnText,
          getTextStyle(undefined, 'displayBold', 'center'),
        ])}
      />
      {!canContinue && (
        <Text
          style={[
            styles.footerHint,
            { color: T.textMuted },
            getTextStyle(undefined, 'body', 'center'),
          ]}
        >
          {t('play.setupIncompleteHint') || 'Enter all names to continue'}
        </Text>
      )}
    </>
  );

  const teamSetupBody = rumbleMode ? (
    <ScrollView
      style={styles.rumbleScrollOuter}
      contentContainerStyle={[
        styles.rumbleScrollContentContainer,
        tightContinueStrip && styles.rumbleScrollContentContainerTight,
        {
          // Outer horizontal inset comes from PlayScaffold (topic-card screen padding).
          paddingHorizontal: 0,
          alignItems: 'center',
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {rumbleTeamsPanel}
    </ScrollView>
  ) : (
    <ScrollView
      style={styles.cardsViewport}
      contentContainerStyle={[
        styles.teamSetupClassicScrollContent,
        classicBodyLayout.contentContainer,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={Platform.OS !== 'web'}
    >
      {landscape ? (
        isWebLayout ? (
          <View
            style={[styles.webLandscapeRow, classicBodyLayout.webLandscapeRow]}
            testID="team-setup-web-row"
          >
            <View style={[styles.webTeamPanel, { minHeight: webTeamCardMinHeight }]}>
              {teamCard(session.teams[0])}
            </View>
            <View style={[styles.webCenterColumn, { minHeight: webTeamCardMinHeight }]}>
              {centerColumn}
              <View style={styles.columnContinue}>{continueControls}</View>
            </View>
            <View style={[styles.webTeamPanel, { minHeight: webTeamCardMinHeight }]}>
              {teamCard(session.teams[1])}
            </View>
          </View>
        ) : (
          <View
            style={[
              styles.landscapeRow,
              shortScreen && styles.landscapeRowTight,
              // When vertically centered, drop flex:1 fill so the row can sit mid-viewport.
              classicBodyLayout.contentContainer.justifyContent === 'center' &&
                styles.landscapeRowContentSized,
            ]}
          >
            <View style={styles.teamCol}>{teamCard(session.teams[0])}</View>
            <View style={styles.centerCol}>
              {centerColumn}
              <View style={styles.columnContinue}>{continueControls}</View>
            </View>
            <View style={styles.teamCol}>{teamCard(session.teams[1])}</View>
          </View>
        )
      ) : (
        <View
          style={[
            styles.portraitColumn,
            shortScreen && styles.portraitColumnTight,
            classicBodyLayout.contentContainer.justifyContent === 'center' &&
              styles.portraitColumnContentSized,
          ]}
        >
          <View style={styles.teamSlot}>{teamCard(session.teams[0])}</View>
          <View style={styles.teamSlot}>{teamCard(session.teams[1])}</View>
          <View style={styles.portraitCenterSlot}>{centerColumn}</View>
        </View>
      )}
    </ScrollView>
  );

  // Classic landscape pins Continue to the center column so its bottom matches the team cards.
  // Rumble and portrait still use the floating strip.
  const showFloatingContinue = rumbleMode || !landscape;

  const mainContent = (
    <View style={styles.fixedViewportLayout}>
      <View style={styles.cardsViewportSlot}>{teamSetupBody}</View>

      {showFloatingContinue && (
        <View
          testID="team-setup-continue-strip"
          style={[styles.floatingButtonWrap, tightContinueStrip && styles.floatingButtonWrapTight]}
        >
          {continueControls}
        </View>
      )}
    </View>
  );

  return (
    <PlayScaffold
      title={t('play.teamSetupTitle')}
      onBack={handleBack}
      backVariant="icon"
      headerLeading={undefined}
      bodyScrollEnabled={false}
      bodyFrame={false}
      backgroundColor={T.canvas}
      // Match banner top pad on the bottom edge (store / chrome symmetry), including Android.
      chromeColumnStyle={{
        paddingBottom: getStandardChromeTopPadding(Platform.OS === 'web'),
      }}
      // Wide web: same max-width as the card row so back/token edges align with cards.
      contentMaxWidth={isWebLayout ? setupRowMaxWidth : undefined}
    >
      <WagerInfoModal visible={wagerInfoOpen} onClose={() => setWagerInfoOpen(false)} />

      <WebAwareModal visible={topicPickerOpen} onRequestClose={() => setTopicPickerOpen(false)}>
        <View
          accessibilityViewIsModal
          style={[styles.topicPickerOverlay, { padding: topicPickerLayout.overlayPad }]}
          testID="random-topic-picker"
        >
          <Pressable
            style={[styles.topicPickerBackdrop, { backgroundColor: COLORS.overlay }]}
            onPress={() => setTopicPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View
            style={[
              styles.topicPickerSheet,
              SOFT_SURFACE_FACE,
              darkModeFlatTop,
              {
                backgroundColor: T.canvas,
                width: topicPickerLayout.sheetMaxWidth,
                maxWidth: topicPickerLayout.sheetMaxWidth,
                maxHeight: topicPickerLayout.maxSheetHeight,
                padding: topicPickerLayout.sheetPad,
                borderRadius: topicPickerLayout.sheetRadius,
                gap: topicPickerLayout.gap,
              },
            ]}
          >
            <Text
              style={[
                styles.topicPickerTitle,
                {
                  color: T.textPrimary,
                  fontSize: topicPickerLayout.titleSize,
                  marginBottom: topicPickerLayout.titleMargin,
                },
                getTextStyle(undefined, 'displayBold', 'center'),
              ]}
            >
              {t('play.numberOfTopics').toUpperCase()}
            </Text>
            <View style={[styles.topicPickerRow, { gap: topicPickerLayout.gap }]}>
              {([1, 2, 3, 4, 5, 6] as const).map((count) => {
                const selected = count === randomTopicCount;
                const optionCost = getGameTokenCost('random', count);
                const faceColor = selected ? T.textPrimary : T.surface;
                const labelColor = selected ? T.surface : T.textPrimary;
                const mutedColor = selected ? 'rgba(255,255,255,0.82)' : T.textMuted;
                return (
                  <Pressable
                    key={count}
                    testID={`random-topic-option-${count}`}
                    onPress={() => {
                      setTopicCount(count);
                      setTopicPickerOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t('play.topicCountOptionA11y', {
                      count,
                      cost: optionCost,
                    })}
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.topicPickerOption,
                      SOFT_SURFACE_FACE,
                      darkModeFlatTop,
                      {
                        width: topicPickerLayout.optionWidth,
                        height: topicPickerLayout.optionHeight,
                        borderRadius: topicPickerLayout.optionRadius,
                        backgroundColor: faceColor,
                        opacity: pressed ? 0.94 : 1,
                        transform: pressed ? [{ scale: 0.97 }] : [{ scale: 1 }],
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.topicPickerOptionText,
                        {
                          color: labelColor,
                          fontSize: topicPickerLayout.optionFontSize,
                          lineHeight: Math.round(topicPickerLayout.optionFontSize * 1.05),
                        },
                        getTextStyle(undefined, 'displayBold', 'center'),
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {count}
                    </Text>
                    <View style={styles.topicPickerOptionCostBlock}>
                      <View style={styles.topicPickerOptionCostRow}>
                        <Ionicons
                          name="diamond"
                          size={topicPickerLayout.tokenIconSize}
                          color={labelColor}
                        />
                        <Text
                          testID={`random-topic-option-cost-${count}`}
                          style={[
                            styles.topicPickerOptionCostText,
                            {
                              color: labelColor,
                              fontSize: topicPickerLayout.tokenCostSize,
                              lineHeight: Math.round(topicPickerLayout.tokenCostSize * 1.15),
                            },
                            getTextStyle(undefined, 'bodySemibold', 'center'),
                          ]}
                          numberOfLines={1}
                        >
                          {optionCost}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.topicPickerOptionTokensWord,
                          {
                            color: mutedColor,
                            fontSize: topicPickerLayout.tokenWordSize,
                            lineHeight: Math.round(topicPickerLayout.tokenWordSize * 1.15),
                          },
                          getTextStyle(undefined, 'bodySemibold', 'center'),
                        ]}
                        numberOfLines={1}
                      >
                        {tokensLabel}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </WebAwareModal>

      {SHOW_HOT_SEAT_UI && hotSeatInfoOpen ? (
        <View accessibilityViewIsModal style={styles.modalOverlay} testID="hot-seat-info-overlay">
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setHotSeatInfoOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={[styles.modalCard, themedStyles.modalCard, { borderColor: 'rgba(51,51,51,0.12)' }]}>
            <Text
              style={[
                styles.modalTitle,
                { color: T.textPrimary },
                getTextStyle(undefined, 'display', 'start'),
              ]}
            >
              {t('play.hotSeatInfoTitle')}
            </Text>
            <Text style={[styles.modalBody, { color: T.textMuted }, getTextStyle()]}>
              {t('play.hotSeatInfoBody')}
            </Text>

          </View>
        </View>
      ) : null}

      <View style={styles.bodyFill}>{mainContent}</View>
    </PlayScaffold>
  );
}

function makeThemedStyles(paletteId: string) {
  const flatTop = paletteId === 'dark'
    ? { borderTopWidth: 0, borderTopColor: 'transparent' as const }
    : undefined;
  return StyleSheet.create({
    rumblePanel: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'card'),
    },
    rumbleCardHeading: { color: T.textPrimary },
    rumbleNameInput: {
      backgroundColor: 'rgba(0,0,0,0.045)',
      color: T.textPrimary,
    },
    rumbleCountButton: {
      backgroundColor: T.surface,
      borderColor: 'rgba(51,51,51,0.12)',
    },
    rumbleCountButtonSelected: {
      backgroundColor: T.textPrimary,
      borderColor: T.textPrimary,
    },
    rumbleCountText: { color: T.textPrimary },
    rumbleCountTextSelected: { color: T.surface },
    teamCard: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'card'),
    },
    teamTitleInput: { color: T.textPrimary },
    playerInput: {
      backgroundColor: 'rgba(0,0,0,0.03)',
      color: T.textPrimary,
    },
    // Theme-adaptive surface fill + primary label (light in light mode, dark in dark mode).
    addPlayerAction: {
      backgroundColor: T.surface,
      borderColor: paletteId === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(51,51,51,0.14)',
    },
    removePlayerAction: {
      backgroundColor: 'rgba(0,0,0,0.03)',
      borderColor: 'rgba(51,51,51,0.14)',
    },
    addPlayerActionText: { color: T.textPrimary },
    removePlayerActionText: { color: T.textMuted },
    linkText: { color: T.textPrimary },
    centerCard: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'card'),
    },
    centerCardTitle: { color: T.textPrimary },
    stepperButton: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'header'),
    },
    stepperGlyph: { color: T.textPrimary },
    stepperValue: { color: T.textPrimary },
    continueBtn: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'pill'),
    },
    continueBtnText: { color: T.textPrimary },
    modalCard: {
      backgroundColor: T.surface,
      ...flatTop,
      ...neumorphicLift(T.shadowStrong, 'hero'),
    },
  });
}

const styles = StyleSheet.create({


  bodyFill: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
    // Outer horizontal inset comes from PlayScaffold (topic-card screen padding).
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  fixedViewportLayout: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  /** Non-scroll body (rumble) sits here; classic uses inner ScrollView with same flex contract. */
  cardsViewportSlot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  cardsViewport: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  teamSetupClassicScrollContent: {
    // justifyContent / alignItems / flexGrow come from getTeamSetupClassicBodyLayout.
    minWidth: 0,
    paddingBottom: SPACING.xs,
    width: '100%',
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: SPACING.md,
    minHeight: 0,
    minWidth: 0,
  },
  /** Content-sized landscape row for vertical centering in ScrollView. */
  landscapeRowContentSized: {
    flex: 0,
    flexGrow: 0,
    width: '100%',
  },
  landscapeRowTight: {
    gap: SPACING.sm,
  },
  teamCol: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
  centerCol: {
    width: 200,
    maxWidth: '28%',
    flexShrink: 0,
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  portraitColumn: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    flexDirection: 'column',
    gap: SPACING.sm,
  },
  portraitColumnContentSized: {
    flex: 0,
    flexGrow: 0,
    width: '100%',
  },
  portraitColumnTight: {
    gap: SPACING.xs,
  },
  teamSlot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  portraitCenterSlot: {
    flexShrink: 0,
    flexGrow: 0,
    alignItems: 'stretch',
  },
  rumbleScroll: {
    flex: 1,
    minHeight: 0,
  },
  rumbleScrollOuter: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    width: '100%',
  },
  rumbleScrollContentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'stretch',
    paddingVertical: SPACING.xs,
  },
  /** Phone / narrow: no vertical inset or flex stretch - panel height follows content. */
  rumbleScrollContentContainerTight: {
    flexGrow: 0,
    justifyContent: 'flex-start',
    paddingVertical: 0,
  },
  rumblePanel: {
    width: '100%',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: 'rgba(51,51,51,0.06)',
    ...PLASTIC_FACE,
    ...neumorphicLift(T.shadowStrong, 'card'),
  },
  /** Single in-card title (guide): "TEAMS" only; count selector implies team count. */
  rumbleCardHeading: {
    fontFamily: FONTS.displayBold,
    letterSpacing: 1.2,
    color: T.textPrimary,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  rumbleNamesGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
  },
  rumbleNameRow: {
    width: '48.8%',
  },
  rumbleNameInput: {
    width: '100%',
    borderWidth: 0,
    /* Pill + slightly stronger fill (guide: light grey bars) */
    backgroundColor: 'rgba(0,0,0,0.045)',
    color: T.textPrimary,
    fontFamily: FONTS.ui,
  },
  rumblePanelCountRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rumbleTopicTabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    width: '100%',
  },
  rumbleTopicTab: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xs,
    paddingVertical: SPACING.xs,
    borderWidth: 1,
    borderColor: 'rgba(51,51,51,0.12)',
  },
  rumbleTopicTabText: {
    color: T.textPrimary,
    textAlign: 'center',
  },
  topicCountTile: {
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'visible',
  },
  topicCountBoxValue: {
    fontFamily: FONTS.displayBold,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  topicTokenCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
  },
  topicTokenCostText: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  topicPickerOverlay: {
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: '100%',
    minHeight: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topicPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  topicPickerSheet: {
    zIndex: 1,
    alignSelf: 'center',
    alignItems: 'center',
  },
  topicPickerTitle: {
    fontFamily: FONTS.displayBold,
    letterSpacing: 0.6,
    textAlign: 'center',
    width: '100%',
  },
  topicPickerRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'center',
    alignItems: 'stretch',
    width: '100%',
  },
  topicPickerOption: {
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: 6,
    overflow: 'visible',
  },
  topicPickerOptionText: {
    fontFamily: FONTS.displayBold,
    textAlign: 'center',
    letterSpacing: -0.6,
  },
  topicPickerOptionCostBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    width: '100%',
    paddingHorizontal: 2,
  },
  topicPickerOptionCostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: '100%',
  },
  topicPickerOptionCostText: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  topicPickerOptionTokensWord: {
    fontFamily: FONTS.uiBold,
    textAlign: 'center',
    letterSpacing: 0.5,
    width: '100%',
  },
  rumbleScrollContent: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  rumbleScrollContentTight: {
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  rumbleTeamGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  rumbleTeamSlot: {
    width: '48%',
    flexGrow: 1,
  },
  rumbleCenterSlot: {
    alignSelf: 'stretch',
  },
  rumbleCountButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: 'rgba(51,51,51,0.12)',
  },
  rumbleCountButtonSelected: {
    backgroundColor: T.textPrimary,
    borderColor: T.textPrimary,
  },
  rumbleCountButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  rumbleCountText: {
    color: T.textPrimary,
    fontSize: FONT_SIZES.md,
  },
  rumbleCountTextSelected: {
    color: T.surface,
  },
  teamCard: {
    flex: 1,
    backgroundColor: T.surface,
    borderRadius: 24,
    minHeight: 0,
    ...PLASTIC_FACE,
    ...neumorphicLift(T.shadowStrong, 'card'),
  },
  teamTitleInput: {
    fontFamily: FONTS.displayBold,
    color: T.textPrimary,
    paddingVertical: SPACING.xs,
    marginBottom: SPACING.xs,
    borderWidth: 0,
    flexShrink: 0,
    textTransform: 'uppercase',
  },
  editableInputWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputWithEditIcon: {
    paddingRight: SPACING.xl + SPACING.sm,
  },
  /** Match right icon pad on the left so textAlign center stays true. */
  teamTitleInputIconPad: {
    paddingLeft: SPACING.xl + SPACING.sm,
  },
  editIconWrap: {
    position: 'absolute',
    right: SPACING.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  teamTitleInputTight: {
    marginBottom: 2,
    paddingVertical: 1,
  },
  teamPlayerList: {
    flex: 1,
    minHeight: 0,
    gap: SPACING.xs,
  },
  playerRowSlot: {
    flexShrink: 0,
    justifyContent: 'flex-start',
  },
  playerInput: {
    flex: 1,
    width: '100%',
    minHeight: 28,
    borderWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderRadius: 16,
    paddingHorizontal: SPACING.md,
    color: T.textPrimary,
  },
  teamLinksRow: {
    width: '100%',
    flexDirection: 'column',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  teamLinksRowTight: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  playerActionButton: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  playerActionPressed: {
    transform: [{ scale: 0.98 }],
  },
  addPlayerAction: {
    // Base light-mode surface; themedStyles overrides per palette.
    backgroundColor: T.surface,
    borderWidth: 1,
    borderColor: 'rgba(51,51,51,0.14)',
  },
  removePlayerAction: {
    backgroundColor: 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(51,51,51,0.14)',
  },
  addPlayerActionText: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONTS.uiSemibold,
    color: T.textPrimary,
  },
  removePlayerActionText: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONTS.uiSemibold,
    color: T.textMuted,
  },
  linkText: {
    fontSize: FONT_SIZES.xs,
    fontFamily: FONTS.uiSemibold,
    color: T.textPrimary,
    textDecorationLine: 'underline',
    opacity: 0.7,
  },
  centerStackLandscape: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  centerStackPortrait: {
    flexShrink: 0,
    flexGrow: 0,
    paddingHorizontal: SPACING.sm,
  },
  centerStackPortraitCompact: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: SPACING.xs,
  },
  centerCardHalfWidth: {
    flex: 1,
    paddingHorizontal: SPACING.xs,
  },
  centerCard: {
    backgroundColor: T.surface,
    borderRadius: 24,
    alignItems: 'center',
    gap: SPACING.xs,
    flexShrink: 0,
    ...PLASTIC_FACE,
    ...neumorphicLift(T.shadowStrong, 'card'),
  },
  centerCardTight: {
    gap: 2,
  },
  centerCardTitle: {
    fontFamily: FONTS.displayBold,
    color: T.textPrimary,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '100%',
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  stepperButton: {
    backgroundColor: T.surface,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...PLASTIC_FACE,
  },
  stepperGlyph: {
    fontSize: 28,
    fontFamily: FONTS.display,
    color: T.textPrimary,
    marginTop: -2,
  },
  stepperValue: {
    minWidth: 40,
    textAlign: 'center',
    fontFamily: FONTS.displayBold,
    color: T.textPrimary,
  },
  helpHit: {
    paddingVertical: SPACING.xs,
  },
  floatingButtonWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: SPACING.xs,
    /** Air under Continue on web / large viewports. */
    paddingBottom: SPACING.lg,
    gap: 2,
    flexShrink: 0,
  },
  floatingButtonWrapTight: {
    paddingTop: SPACING.xs,
    // Bottom edge air comes from PlayScaffold chromeColumnStyle (matches banner top pad).
    paddingBottom: 0,
  },
  footerInner: {
    width: '100%',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  continueBtn: {
    width: '100%',
    maxWidth: 320,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: T.surface,
    borderRadius: 14,
    ...PLASTIC_FACE,
    ...neumorphicLift(T.shadowStrong, 'pill'),
  },
  continueBtnText: {
    color: T.textPrimary,
    fontFamily: FONTS.displayBold,
    fontSize: 15,
    letterSpacing: 1.1,
  },
  footerHint: {
    marginTop: 0,
    opacity: 0.8,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    borderRadius: 42,
    backgroundColor: T.surface,
    padding: SPACING.xl,
    maxWidth: 340,
    alignSelf: 'center',
    width: '100%',
    ...PLASTIC_FACE,
    ...neumorphicLift(T.shadowStrong, 'hero'),
  },
  modalTitle: {
    fontSize: FONT_SIZES.xl,
    fontFamily: FONTS.displayBold,
    marginBottom: SPACING.md,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.lg,
    textAlign: 'center',
    fontFamily: FONTS.ui,
  },

  /* ── Web-only desktop layout ── */
  /**
   * Outer row base styles. Placement (maxWidth, flexGrow:0, centering) comes from
   * `getTeamSetupClassicBodyLayout` so the block stays content-sized and can be
   * centered inside the ScrollView.
   */
  webLandscapeRow: {
    flexDirection: 'row',
    gap: 36,
    minHeight: 0,
    minWidth: 0,
  },
  /**
   * Team panel on wide web. Fills side of the shared frame (no maxWidth cap) so
   * the card's outer edge matches the header back / token chip edge.
   * Runtime `minHeight` from `getWebTeamCardMinHeight`.
   */
  webTeamPanel: {
    flex: 1,
    minWidth: 0,
  },
  /** Applied to the card face inside `webTeamPanel`; minHeight set inline from viewport. */
  webTeamCardTall: {
    width: '100%',
    flex: 1,
  },
  /**
   * Center column matches team card height. Wager stays upper; Continue is
   * pinned to the bottom via `marginTop: 'auto'` on the continue section.
   */
  webCenterColumn: {
    width: 260,
    flexShrink: 0,
    flexGrow: 0,
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 32,
    paddingTop: SPACING.md,
  },
  /** Same baseline as team cards: no extra pad under Continue. */
  columnContinue: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
  },
  /** Slightly wider Continue button on web, matching the center column scale. */
  webContinueBtn: {
    maxWidth: 280,
    minHeight: 48,
  },

});
