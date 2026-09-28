/**
 * Direction A: BROADCAST. The game as a live TV graphics package.
 * Square slabs, heavy tracked capitals, big tabular numerals, a persistent
 * lower-third scoreboard, a live timer bar on the top edge, and wipes rather
 * than fades. Structure over decoration: the screen is a broadcast frame.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '@/components/ui/Pressable';
import { useI18n } from '@/lib/i18n/useI18n';
import type { TeamState } from '@/features/shared';
import { TABULAR, useR2Theme, type R2Colors } from './theme';
import {
  CountUp,
  EASE_OUT,
  Enter,
  awardableTeams,
  buildRecap,
  fitFontSize,
  isTie,
  rankTeams,
  usePulse,
  type R2BoardProps,
  type R2HomeProps,
  type R2LobbyProps,
  type R2QuestionProps,
  type R2ResultsProps,
} from './shared';

const NATIVE = Platform.OS !== 'web';

/* ------------------------------------------------------------ primitives */

function Kicker({ children, color, bug }: { children: string; color: string; bug?: string }) {
  const { f } = useR2Theme();
  return (
    <View style={s.kickerRow}>
      <View style={[s.bug, { backgroundColor: bug ?? color }]} />
      <Text style={[s.kicker, { color, fontFamily: f.uiBold }]} numberOfLines={1}>
        {children.toUpperCase()}
      </Text>
    </View>
  );
}

function Slab({
  label,
  onPress,
  tone,
  icon,
  disabled,
  height = 52,
  flex,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone: 'ink' | 'line' | 'right' | 'wrong' | 'ghost';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  height?: number;
  flex?: number;
  testID?: string;
}) {
  const { c, f } = useR2Theme();
  const bg =
    tone === 'ink' ? c.ink : tone === 'right' ? c.right : tone === 'wrong' ? c.wrong : 'transparent';
  const fg =
    tone === 'ink' ? c.onInk : tone === 'right' ? c.onRight : tone === 'wrong' ? c.onWrong : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.slab,
        {
          height,
          flex,
          backgroundColor: bg,
          borderColor: tone === 'line' ? c.text : tone === 'ghost' ? c.lineStrong : bg,
          borderWidth: tone === 'line' ? 2 : tone === 'ghost' ? 1 : 0,
          opacity: disabled ? 0.35 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[s.slabText, { color: fg, fontFamily: f.display, fontSize: height <= 46 ? 12.5 : 14 }]} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
    </Pressable>
  );
}

function IconSquare({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  const { c } = useR2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.iconSquare,
        { borderColor: c.lineStrong, backgroundColor: pressed ? c.surface2 : 'transparent' },
      ]}
    >
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );
}

/** The lower third: every team, scores in big numerals, the team to play inverted. */
function LowerThird({ teams, currentTeamId }: { teams: TeamState[]; currentTeamId?: string }) {
  const { c, f } = useR2Theme();
  return (
    <View style={[s.lowerThird, { borderTopColor: c.text }]}>
      {teams.map((team, i) => {
        const on = team.id === currentTeamId;
        return (
          <Enter key={team.id} dy={0} dx={-24} delay={i * 60} style={s.ltCellWrap}>
            <View
              style={[
                s.ltCell,
                {
                  backgroundColor: on ? c.text : c.surface,
                  borderRightColor: c.line,
                },
              ]}
            >
              {on ? <View style={[s.ltLive, { backgroundColor: c.bg }]} /> : null}
              <Text
                style={[s.ltName, { color: on ? c.bg : c.muted, fontFamily: f.uiBold }]}
                numberOfLines={1}
              >
                {team.name.toUpperCase()}
              </Text>
              <Text style={[s.ltScore, TABULAR, { color: on ? c.bg : c.text, fontFamily: f.display }]}>
                <CountUp value={team.score} duration={520} from={team.score} />
              </Text>
            </View>
          </Enter>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ home */

export function BroadcastHome({ modes, tokens, tokensLabel, onSelectMode, onOpenSettings, onOpenStore, resume }: R2HomeProps) {
  const { c, f } = useR2Theme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const padX = Math.max(insets.left, insets.right, 20);

  const header = (
    <View style={[s.homeTop, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 12) }]}>
      <View style={s.row}>
        <View style={[s.logoBlock, { backgroundColor: c.text }]}>
          <Text style={[s.logoText, { color: c.bg, fontFamily: f.display }]}>BACKFIRE</Text>
        </View>
        {portrait ? null : <Text style={[s.logoTag, { color: c.muted, fontFamily: f.uiBold }]}>TRIVIA NIGHT · LIVE</Text>}
      </View>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${tokensLabel}: ${tokens}`}
          onPress={onOpenStore}
          style={[s.tokenTag, { borderColor: c.lineStrong }]}
        >
          <Text style={[s.tokenNum, TABULAR, { color: c.text, fontFamily: f.display }]}>{tokens}</Text>
          <Text style={[s.tokenLabel, { color: c.muted, fontFamily: f.uiBold }]}>{tokensLabel.toUpperCase()}</Text>
        </Pressable>
        <IconSquare icon="settings-sharp" onPress={onOpenSettings} label="Settings" />
      </View>
    </View>
  );

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      {header}
      <View
        style={[
          portrait ? s.channelsCol : s.channelsRow,
          { marginHorizontal: padX, marginBottom: Math.max(insets.bottom, 16), borderColor: c.text },
        ]}
      >
        {modes.map((mode, i) => {
          const featured = mode.id === 'classic';
          const fg = featured ? c.bg : c.text;
          return (
            <Enter
              key={mode.id}
              dy={portrait ? 0 : 40}
              dx={portrait ? -30 : 0}
              delay={80 + i * 70}
              style={portrait ? s.channelWrapCol : s.channelWrapRow}
            >
              <Pressable
                testID={`home-mode-card-${mode.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${mode.title}. ${mode.copy}`}
                onPress={() => onSelectMode(mode.id)}
                style={({ pressed }) => [
                  s.channel,
                  portrait ? s.channelPortrait : null,
                  {
                    backgroundColor: featured ? c.text : pressed ? c.surface2 : c.surface,
                    borderRightColor: c.line,
                    borderBottomColor: c.line,
                  },
                ]}
              >
                <View style={s.channelTop}>
                  <Text style={[s.channelNo, TABULAR, portrait ? s.channelNoPortrait : null, { color: featured ? c.faint : c.surface3, fontFamily: f.display }]}>
                    {String(i + 1).padStart(2, '0')}
                  </Text>
                  {featured && !portrait ? (
                    <View style={[s.onAir, { borderColor: c.bg }]}>
                      <Text style={[s.onAirText, { color: c.bg, fontFamily: f.uiBold }]}>MAIN EVENT</Text>
                    </View>
                  ) : null}
                </View>
                <View style={portrait ? { flex: 1, marginLeft: 16 } : null}>
                  <Text style={[s.channelTitle, { color: fg, fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>
                    {mode.title.toUpperCase()}
                  </Text>
                  <Text style={[s.channelCopy, { color: featured ? c.faint : c.muted, fontFamily: f.uiMedium }]} numberOfLines={portrait ? 2 : 3}>
                    {mode.copy}
                  </Text>
                  <View style={[s.channelFoot, { borderTopColor: featured ? 'rgba(128,128,128,0.4)' : c.line }]}>
                    <Text style={[s.channelCost, TABULAR, { color: fg, fontFamily: f.uiBold }]}>
                      {mode.cost} {tokensLabel.toUpperCase()}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color={fg} />
                  </View>
                </View>
              </Pressable>
            </Enter>
          );
        })}
      </View>
      {resume ? <BroadcastResume {...resume} /> : null}
    </View>
  );
}

function BroadcastResume(r: NonNullable<R2HomeProps['resume']>) {
  const { c, f } = useR2Theme();
  return (
    <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: c.scrim }]} testID="home-resume-overlay">
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={r.onClose} style={StyleSheet.absoluteFill} />
      <Enter dx={-60} dy={0} style={[s.resumeCard, { backgroundColor: c.surface, borderLeftColor: c.text }]}>
        <Kicker color={c.muted} bug={c.text}>Match in progress</Kicker>
        <Text style={[s.resumeTitle, { color: c.text, fontFamily: f.display }]}>{r.title.toUpperCase()}</Text>
        <Text style={[s.resumeBody, { color: c.muted, fontFamily: f.uiMedium }]}>{r.body}</Text>
        <View style={[s.row, { gap: 8, marginTop: 16 }]}>
          <Slab label={r.continueLabel} tone="line" onPress={r.onContinue} flex={1} height={46} />
          <Slab label={r.newLabel} tone="ghost" onPress={r.onNewGame} flex={1} height={46} />
        </View>
      </Enter>
    </View>
  );
}

/* ----------------------------------------------------------------- lobby */

export function BroadcastLobby(p: R2LobbyProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { session } = p;
  const teams = session.teams;
  const padX = Math.max(insets.left, insets.right, 16);

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.barTop, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 10) }]}>
        <IconSquare icon="arrow-back" onPress={p.onBack} label={t('common.back')} />
        <Kicker color={c.text}>{t('play.teamSetupTitle')}</Kicker>
        <View style={{ width: 40 }} />
      </View>
      <View style={[s.lobbySplit, { marginHorizontal: padX, borderColor: c.text }]}>
        {teams.map((team, i) => (
          <Enter
            key={team.id}
            dx={i % 2 === 0 ? -50 : 50}
            dy={0}
            delay={60 + i * 80}
            style={[s.lobbyHalf, { borderRightColor: c.text, borderRightWidth: i < teams.length - 1 ? 2 : 0 }]}
          >
            <Text style={[s.lobbyIndex, TABULAR, { color: c.faint, fontFamily: f.uiBold }]}>
              {`TEAM ${String(i + 1).padStart(2, '0')}`}
            </Text>
            <TextInput
              value={team.name}
              onChangeText={(v) => p.updateTeamName(team.id, v)}
              placeholder={t('play.teamNamePlaceholder')}
              placeholderTextColor={c.faint}
              style={[s.lobbyName, { color: c.text, fontFamily: f.display, borderBottomColor: c.text }]}
              maxLength={24}
              accessibilityLabel={t('play.teamNamePlaceholder')}
            />
            <ScrollView style={s.fill} contentContainerStyle={{ paddingBottom: 8 }}>
              {(team.playerNames ?? []).map((name, j) => (
                <View key={j} style={[s.playerRow, { borderBottomColor: c.line }]}>
                  <Text style={[s.playerNo, TABULAR, { color: c.faint, fontFamily: f.display }]}>{String(j + 1).padStart(2, '0')}</Text>
                  <TextInput
                    value={name}
                    onChangeText={(v) => p.updateTeamMemberName(team.id, j, v)}
                    placeholder={t('play.playerPlaceholder', { count: j + 1 })}
                    placeholderTextColor={c.faint}
                    style={[s.playerInput, { color: c.text, fontFamily: f.uiSemi }]}
                    maxLength={24}
                  />
                </View>
              ))}
              <View style={[s.row, { gap: 14, marginTop: 8 }]}>
                <Pressable accessibilityRole="button" onPress={() => p.addTeamMember(team.id)}>
                  <Text style={[s.linkCaps, { color: c.text, fontFamily: f.uiBold }]}>+ {t('play.addPlayerLink').toUpperCase()}</Text>
                </Pressable>
                {(team.playerNames ?? []).length > 1 ? (
                  <Pressable accessibilityRole="button" onPress={() => p.removeTeamMember(team.id)}>
                    <Text style={[s.linkCaps, { color: c.muted, fontFamily: f.uiBold }]}>− REMOVE</Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          </Enter>
        ))}
        {teams.length === 2 ? (
          <View pointerEvents="none" style={s.vsWrap}>
            <Enter scale={0.4} dy={0} delay={260} style={[s.vs, { backgroundColor: c.text }]}>
              <Text style={[s.vsText, { color: c.bg, fontFamily: f.display }]}>VS</Text>
            </Enter>
          </View>
        ) : null}
      </View>
      <View style={[s.lobbyBar, { marginHorizontal: padX, marginBottom: Math.max(insets.bottom, 12) }]}>
        {p.wagerEnabled ? (
          <View style={[s.row, { gap: 10 }]}>
            <Pressable accessibilityRole="button" onPress={p.onWagerInfo}>
              <Text style={[s.linkCaps, { color: c.muted, fontFamily: f.uiBold }]}>{t('play.wagersPerTeam').toUpperCase()} ⓘ</Text>
            </Pressable>
            <IconSquare icon="remove" label="Fewer wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam - 1)} />
            <Text style={[s.stepVal, TABULAR, { color: c.text, fontFamily: f.display }]}>{session.wagersPerTeam}</Text>
            <IconSquare icon="add" label="More wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam + 1)} />
          </View>
        ) : (
          <View />
        )}
        <View style={{ width: 260 }}>
          <Slab
            testID="team-setup-continue"
            label={p.canContinue ? t('play.continueToTopics') : t('play.setupIncompleteHint')}
            tone="line"
            icon="arrow-forward"
            disabled={!p.canContinue}
            onPress={p.onContinue}
            height={44}
          />
        </View>
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- board */

export function BroadcastBoard(p: R2BoardProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padX = Math.max(insets.left, insets.right, 12);
  const cols = p.columns;
  const rows = Math.max(1, ...cols.map((col) => col.rows.length));
  const gap = 3;
  const gridW = width - padX * 2;
  const colW = (gridW - gap * (cols.length - 1)) / Math.max(1, cols.length);
  const topH = 44;
  const ltH = 52;
  const headH = Math.max(52, Math.min(78, height * 0.17));
  const gridH = height - Math.max(insets.top, 8) - topH - ltH - Math.max(insets.bottom, 6) - headH - 12;
  const cellH = Math.max(28, (gridH - gap * (rows - 1)) / rows);
  const numSize = Math.min(28, Math.max(12, Math.min(cellH * 0.5, (colW / 2) * 0.3)));
  const current = p.session.teams.find((team) => team.id === p.session.currentTeamId);

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.barTop, { height: topH + Math.max(insets.top, 8), paddingTop: Math.max(insets.top, 8), paddingHorizontal: padX }]}>
        <IconSquare icon="arrow-back" onPress={p.onBack} label={t('common.back')} />
        <Kicker color={c.text}>{current ? `${current.name} to pick` : t('play.questionBoardTitle')}</Kicker>
        <IconSquare icon="menu" onPress={p.onMenu} label={t('play.matchMenuA11y')} />
      </View>
      <View style={[s.boardGrid, { paddingHorizontal: padX, gap }]}>
        {cols.map((col, ci) => {
          const art = p.art(col.categoryId);
          return (
            <View key={col.categoryId} style={{ width: colW, gap }}>
              <Enter dy={-16} delay={ci * 60} style={[s.boardHead, { height: headH, backgroundColor: c.text }]}>
                {art ? <Image source={art} style={{ width: headH * 0.52, height: headH * 0.52 }} contentFit="contain" /> : null}
                <Text style={[s.boardHeadText, { color: c.bg, fontFamily: f.display }]} numberOfLines={2} adjustsFontSizeToFit>
                  {col.categoryName.toUpperCase()}
                </Text>
              </Enter>
              {col.rows.map((row, ri) => (
                <View key={row.pointValue} style={{ flexDirection: 'row', gap, height: cellH }}>
                  {[row.left, row.right].map((q, side) => {
                    const used = p.isUsed(q);
                    const lit = p.flashingId === q.id || p.lockedId === q.id;
                    return (
                      <Enter key={`${q.id}-${side}`} dy={0} scale={0.6} delay={180 + (ri * cols.length + ci) * 22} duration={360} style={s.fill}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${col.categoryName}, ${q.pointValue} points${used ? ', played' : ''}`}
                          onPress={() => p.onTilePress(q)}
                          style={({ pressed }) => [
                            s.boardCell,
                            {
                              backgroundColor: lit ? c.right : used ? 'transparent' : pressed ? c.surface3 : c.surface,
                              borderColor: used ? c.line : c.surface,
                              borderWidth: used ? 1 : 0,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.boardNum,
                              TABULAR,
                              {
                                fontSize: numSize,
                                color: lit ? c.onRight : used ? c.faint : c.text,
                                fontFamily: f.display,
                                textDecorationLine: used ? 'line-through' : 'none',
                                opacity: used ? 0.5 : 1,
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {q.pointValue}
                          </Text>
                        </Pressable>
                      </Enter>
                    );
                  })}
                </View>
              ))}
            </View>
          );
        })}
      </View>
      <View style={{ paddingHorizontal: padX, paddingBottom: Math.max(insets.bottom, 6), height: ltH + Math.max(insets.bottom, 6) }}>
        <LowerThird teams={p.session.teams} currentTeamId={p.session.currentTeamId} />
      </View>
    </View>
  );
}

/* -------------------------------------------------------- question/answer */

export function BroadcastQuestion(p: R2QuestionProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padX = Math.max(insets.left, insets.right, 20);
  const q = p.question;
  const s2 = p.session;
  const current = s2.teams.find((team) => team.id === s2.currentTeamId);
  const wagerQ = Boolean(s2.wager?.question);
  const review = Boolean(s2.reviewingUsedQuestion);
  const scored = s2.phase === 'scoring';
  const progress = Math.min(1, p.elapsedSeconds / Math.max(1, p.maxSeconds));
  const pulse = usePulse(1400);

  // The answer slab wipes up from the floor.
  const wipe = useRef(new Animated.Value(p.isAnswerPhase ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(wipe, {
      toValue: p.isAnswerPhase ? 1 : 0,
      duration: 460,
      easing: EASE_OUT,
      useNativeDriver: NATIVE,
    }).start();
  }, [p.isAnswerPhase, wipe]);

  const leftW = p.isAnswerPhase ? width * 0.6 - padX : width - padX * 2;
  const qBoxH = p.isAnswerPhase ? height * 0.28 : height - 170 - Math.max(insets.top, 8);
  const qSize = fitFontSize(q.prompt, leftW, qBoxH, p.isAnswerPhase ? 22 : 40, 13, 0.56, 1.1);
  const aSize = fitFontSize(q.answer, leftW - 40, height * 0.22, 46, 16, 0.6, 1.05);
  const teams = awardableTeams(s2, q);

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      {/* live timer bar */}
      <View style={[s.timerTrack, { backgroundColor: c.surface2, marginTop: Math.max(insets.top, 0) }]}>
        <View style={[s.timerFill, { width: `${progress * 100}%`, backgroundColor: p.hasTimedOut ? c.wrong : c.text }]} />
      </View>
      <View style={[s.qTop, { paddingHorizontal: padX }]}>
        <IconSquare icon="arrow-back" onPress={p.onBack} label={t('common.back')} />
        <View style={[s.row, { gap: 10, flex: 1, marginLeft: 12 }]}>
          <Kicker color={c.text}>{`${q.categoryName} · ${q.pointValue}`}</Kicker>
          {current && !review ? (
            <Text style={[s.qTeam, { color: c.muted, fontFamily: f.uiBold }]} numberOfLines={1}>
              {`${current.name.toUpperCase()} TO ANSWER`}
            </Text>
          ) : null}
        </View>
        <View style={s.row}>
          {!p.isAnswerPhase ? (
            <Animated.View style={[s.liveDot, { backgroundColor: c.wrong, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.25] }) }]} />
          ) : null}
          <Text style={[s.qClock, TABULAR, { color: p.hasTimedOut ? c.wrong : c.text, fontFamily: f.display }]}>{p.timeLabel}</Text>
        </View>
      </View>

      <View style={[s.fill, s.rowTop, { paddingHorizontal: padX }]}>
        <View style={{ width: leftW, flex: p.isAnswerPhase ? undefined : 1 }}>
          <Enter dx={-40} dy={0} revealKey={q.id} style={{ flex: p.isAnswerPhase ? undefined : 1, justifyContent: 'center' }}>
            <Text
              testID="question-prompt"
              style={[s.qText, { fontSize: qSize, lineHeight: Math.round(qSize * 1.1), color: c.text, fontFamily: f.display }]}
            >
              {q.prompt}
            </Text>
            {p.promptImage && !p.isAnswerPhase ? (
              <Image source={p.promptImage} style={s.qImage} contentFit="contain" />
            ) : null}
            {p.guide ? <Text style={[s.guide, { color: c.muted, fontFamily: f.uiSemi }]}>{p.guide}</Text> : null}
          </Enter>

          {p.isAnswerPhase ? (
            <Animated.View
              testID="question-answer-box"
              style={[
                s.answerSlab,
                {
                  backgroundColor: c.ink,
                  opacity: wipe,
                  transform: [{ translateY: wipe.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }],
                },
              ]}
            >
              <View style={[s.row, { gap: 8 }]}>
                <View style={[s.bug, { backgroundColor: c.onInk }]} />
                <Text style={[s.kicker, { color: c.inkMuted, fontFamily: f.uiBold }]}>
                  {p.hasTimedOut ? t('play.timeUpTitle').toUpperCase() : t('play.correctAnswer').toUpperCase()}
                </Text>
              </View>
              <Text style={[s.answerText, { fontSize: aSize, lineHeight: Math.round(aSize * 1.05), color: c.onInk, fontFamily: f.display }]}>
                {q.answer}
              </Text>
            </Animated.View>
          ) : null}
        </View>

        {p.isAnswerPhase ? (
          <Enter dx={40} dy={0} delay={180} style={[s.awardCol, { borderLeftColor: c.text }]}>
            {review ? (
              <Slab label={t('common.back')} tone="line" onPress={p.onBack} icon="arrow-back" />
            ) : wagerQ ? (
              <>
                <Kicker color={c.muted}>{t('play.wagerCardTitle')}</Kicker>
                <Slab label="Right" tone="right" icon="checkmark" onPress={() => p.onResolveWager(true)} />
                <Slab label="Wrong" tone="wrong" icon="close" onPress={() => p.onResolveWager(false)} />
              </>
            ) : (
              <>
                <Kicker color={c.muted}>{p.hasTimedOut ? t('play.noPointsAwarded') : t('play.whoGetsPoints')}</Kicker>
                {teams.map((team) => {
                  const chosen = scored && s2.lastAwardedTeamId === team.id;
                  return (
                    <Slab
                      key={team.id}
                      label={`${team.name}  +${q.pointValue}`}
                      tone={chosen ? 'right' : 'ghost'}
                      icon={chosen ? 'checkmark' : undefined}
                      disabled={p.hasTimedOut}
                      onPress={() => p.onAward(team.id)}
                      height={44}
                    />
                  );
                })}
                <Slab
                  label={t('play.neitherTeam')}
                  tone={scored && s2.lastAwardedTeamId === null ? 'wrong' : 'ghost'}
                  icon={scored && s2.lastAwardedTeamId === null ? 'close' : undefined}
                  disabled={p.hasTimedOut}
                  onPress={() => p.onAward(null)}
                  height={44}
                />
                <View style={s.fill} />
                <View style={[s.row, { gap: 6 }]}>
                  {p.canWager ? <Slab label="Wager" tone="ghost" onPress={p.onWager} height={46} flex={1} /> : null}
                  <Slab
                    label={s2.bonus.active ? t('play.finishMatch') : t('play.nextTurn')}
                    tone="line"
                    icon="arrow-forward"
                    disabled={!scored}
                    onPress={p.onNext}
                    height={46}
                    flex={2}
                  />
                </View>
              </>
            )}
            <Pressable accessibilityRole="button" onPress={p.onReport} style={{ alignSelf: 'flex-end', marginTop: 6 }}>
              <Text style={[s.linkCaps, { color: c.faint, fontFamily: f.uiBold }]}>REPORT</Text>
            </Pressable>
          </Enter>
        ) : null}
      </View>

      {!p.isAnswerPhase ? (
        <View style={{ paddingHorizontal: padX, paddingBottom: Math.max(insets.bottom, 12), paddingTop: 8 }}>
          <Slab
            testID="question-show-answer"
            label={t('play.showAnswer')}
            tone="ink"
            icon="eye"
            disabled={!p.canShowAnswer}
            onPress={p.onShowAnswer}
            height={54}
          />
        </View>
      ) : (
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      )}
    </View>
  );
}

/* --------------------------------------------------------------- results */

export function BroadcastResults(p: R2ResultsProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const padX = Math.max(insets.left, insets.right, 20);
  const ranked = rankTeams(p.session.teams);
  const tie = isTie(p.session.teams);
  const winner = ranked[0]!;
  const recap = useMemo(() => buildRecap(p.session), [p.session]);
  const right = recap.filter((r) => r.right).length;

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.barTop, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 10) }]}>
        <Kicker color={c.text} bug={c.wrong}>{`${t('play.matchComplete')} · FINAL`}</Kicker>
        <Pressable accessibilityRole="button" onPress={p.onReviewBoard}>
          <Text style={[s.linkCaps, { color: c.muted, fontFamily: f.uiBold }]}>{t('play.questionBoardTitle').toUpperCase()} →</Text>
        </Pressable>
      </View>
      <View style={[s.fill, s.rowTop, { paddingHorizontal: padX, gap: 20 }]}>
        <View style={[s.fill, { justifyContent: 'center' }]}>
          <Enter dx={-60} dy={0}>
            <Text style={[s.kicker, { color: c.muted, fontFamily: f.uiBold }]}>
              {(tie ? t('play.tieGame') : t('play.winner')).toUpperCase()}
            </Text>
            <Text style={[s.winName, { color: c.text, fontFamily: f.display, fontSize: Math.min(56, height * 0.14), lineHeight: Math.round(Math.min(56, height * 0.14) * 1.02) }]} numberOfLines={2} adjustsFontSizeToFit>
              {tie ? ranked.filter((x) => x.score === winner.score).map((x) => x.name).join(' & ').toUpperCase() : winner.name.toUpperCase()}
            </Text>
          </Enter>
          <Enter dy={0} dx={-60} delay={120}>
            <Text style={[s.winScore, TABULAR, { color: c.text, fontFamily: f.display, fontSize: Math.min(96, height * 0.24) }]}>
              <CountUp value={winner.score} duration={1100} />
            </Text>
          </Enter>
        </View>
        <Enter dx={60} dy={0} delay={200} style={[s.standings, { borderLeftColor: c.text }]}>
          {ranked.map((team, i) => (
            <View key={team.id} style={[s.standRow, { borderBottomColor: c.line, backgroundColor: i === 0 ? c.text : 'transparent' }]}>
              <Text style={[s.standPos, TABULAR, { color: i === 0 ? c.bg : c.faint, fontFamily: f.display }]}>{i + 1}</Text>
              <Text style={[s.standName, { color: i === 0 ? c.bg : c.text, fontFamily: f.uiBold }]} numberOfLines={1}>
                {team.name.toUpperCase()}
              </Text>
              <Text style={[s.standScore, TABULAR, { color: i === 0 ? c.bg : c.text, fontFamily: f.display }]}>
                <CountUp value={team.score} duration={900} />
              </Text>
            </View>
          ))}
          <Text style={[s.recapLabel, { color: c.muted, fontFamily: f.uiBold }]}>
            {`ROUND BY ROUND · ${right} RIGHT · ${recap.length - right} WRONG`}
          </Text>
          <View style={s.recapStrip}>
            {recap.map((r, i) => (
              <Enter key={r.question.id} dy={0} scale={0.2} delay={500 + i * 25} duration={260}>
                <View style={[s.recapCell, { backgroundColor: r.right ? c.right : c.wrong }]} />
              </Enter>
            ))}
          </View>
        </Enter>
      </View>
      <View style={[s.row, { gap: 8, paddingHorizontal: padX, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Slab label={t('play.backToHome')} tone="ghost" onPress={p.onHome} flex={1} height={48} />
        <Slab label={t('play.startAnotherMatch')} tone="line" icon="refresh" onPress={p.onAnotherMatch} flex={2} height={48} />
      </View>
    </View>
  );
}

/* ---------------------------------------------------------------- styles */

const s = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'stretch' },
  center: { alignItems: 'center', justifyContent: 'center' },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  bug: { width: 8, height: 8 },
  kicker: { fontSize: 11, letterSpacing: 2.2, flexShrink: 1 },
  slab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 10,
  },
  slabText: { fontSize: 14, letterSpacing: 1.6, flexShrink: 1 },
  iconSquare: { width: 40, height: 40, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  lowerThird: { flexDirection: 'row', borderTopWidth: 3, height: 52 },
  ltCellWrap: { flex: 1 },
  ltCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRightWidth: 1,
    gap: 8,
  },
  ltLive: { width: 6, height: 22 },
  ltName: { fontSize: 11, letterSpacing: 1.8, flex: 1 },
  ltScore: { fontSize: 26, letterSpacing: -0.5 },
  homeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12 },
  logoBlock: { paddingHorizontal: 10, paddingVertical: 4 },
  logoText: { fontSize: 18, letterSpacing: 1 },
  logoTag: { fontSize: 10, letterSpacing: 2.4, marginLeft: 12 },
  tokenTag: { flexDirection: 'row', alignItems: 'baseline', gap: 6, borderWidth: 1, paddingHorizontal: 12, height: 40, marginRight: 8, paddingTop: 9 },
  tokenNum: { fontSize: 18 },
  tokenLabel: { fontSize: 9, letterSpacing: 2 },
  channelsRow: { flex: 1, flexDirection: 'row', borderTopWidth: 3 },
  channelsCol: { flex: 1, flexDirection: 'column', borderTopWidth: 3 },
  channelWrapRow: { flex: 1 },
  channelWrapCol: { flex: 1 },
  channel: { flex: 1, padding: 16, justifyContent: 'space-between', borderRightWidth: 1, borderBottomWidth: 1 },
  channelPortrait: { flexDirection: 'row', alignItems: 'flex-end' },
  channelTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  channelNo: { fontSize: 54, lineHeight: 56, letterSpacing: -2 },
  channelNoPortrait: { fontSize: 36, lineHeight: 38 },
  onAir: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  onAirText: { fontSize: 8, letterSpacing: 1.6 },
  channelTitle: { fontSize: 22, letterSpacing: 0.4 },
  channelCopy: { fontSize: 11.5, lineHeight: 15, marginTop: 4 },
  channelFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 10, paddingTop: 8 },
  channelCost: { fontSize: 11, letterSpacing: 1.6 },
  resumeCard: { width: 420, maxWidth: '90%', padding: 22, borderLeftWidth: 6 },
  resumeTitle: { fontSize: 24, marginTop: 10 },
  resumeBody: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  barTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8, gap: 12 },
  lobbySplit: { flex: 1, flexDirection: 'row', borderTopWidth: 3, borderBottomWidth: 3 },
  lobbyHalf: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
  lobbyIndex: { fontSize: 10, letterSpacing: 2.4 },
  lobbyName: { fontSize: 30, paddingVertical: 4, borderBottomWidth: 2, marginBottom: 6, letterSpacing: -0.3 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, height: 36 },
  playerNo: { fontSize: 14, width: 22 },
  playerInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  linkCaps: { fontSize: 11, letterSpacing: 1.8 },
  vsWrap: { position: 'absolute', left: 0, right: 0, bottom: -24, alignItems: 'center' },
  vs: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }] },
  vsText: { fontSize: 15, transform: [{ rotate: '-45deg' }] },
  lobbyBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10 },
  stepVal: { fontSize: 24, minWidth: 22, textAlign: 'center' },
  boardGrid: { flex: 1, flexDirection: 'row', paddingTop: 4, paddingBottom: 8 },
  boardHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 },
  boardHeadText: { flex: 1, fontSize: 10.5, letterSpacing: 0.4, lineHeight: 13 },
  boardCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  boardNum: { letterSpacing: -0.5 },
  timerTrack: { height: 4, width: '100%' },
  timerFill: { height: 4 },
  qTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56 },
  qTeam: { fontSize: 10, letterSpacing: 1.8, flexShrink: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  qClock: { fontSize: 26, letterSpacing: -0.5 },
  qText: { letterSpacing: -0.4 },
  qImage: { width: '100%', height: 90, marginTop: 10 },
  guide: { fontSize: 12, marginTop: 8, letterSpacing: 0.3 },
  answerSlab: { flex: 1, marginTop: 12, marginBottom: 4, padding: 18, justifyContent: 'space-between' },
  answerText: { letterSpacing: -0.6 },
  awardCol: { flex: 1, marginLeft: 20, paddingLeft: 20, borderLeftWidth: 2, gap: 6, paddingBottom: 4 },
  winName: { letterSpacing: -1, marginTop: 4, lineHeight: undefined },
  winScore: { letterSpacing: -3 },
  standings: { width: '44%', borderLeftWidth: 2, paddingLeft: 18, justifyContent: 'center' },
  standRow: { flexDirection: 'row', alignItems: 'center', height: 42, borderBottomWidth: 1, paddingHorizontal: 10, gap: 12 },
  standPos: { fontSize: 20, width: 18 },
  standName: { flex: 1, fontSize: 12, letterSpacing: 1.6 },
  standScore: { fontSize: 22 },
  recapLabel: { fontSize: 10, letterSpacing: 1.8, marginTop: 14, marginBottom: 6 },
  recapStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  recapCell: { width: 14, height: 14 },
});

export type { R2Colors };
