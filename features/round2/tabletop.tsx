/**
 * Direction C: TABLETOP. The game as beautiful physical objects on a table.
 * Heavy card stock with real layered shadows, a fanned deck of modes, player
 * seats around the table, values as round chips, a question card that flips
 * over to show the answer, and a winner card dealt on top of the pile.
 * Premium through tactility: weight, depth and one satisfying flip.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '@/components/ui/Pressable';
import { useI18n } from '@/lib/i18n/useI18n';
import { TABULAR, useR2Theme, type R2Colors } from './theme';
import {
  CountUp,
  EASE_OUT,
  Enter,
  awardableTeams,
  buildRecap,
  fitFontSize,
  initials,
  isTie,
  rankTeams,
  useReducedMotion,
  type R2BoardProps,
  type R2HomeProps,
  type R2LobbyProps,
  type R2QuestionProps,
  type R2ResultsProps,
} from './shared';

const NATIVE = Platform.OS !== 'web';

/* ------------------------------------------------------------ primitives */

function lift(c: R2Colors, isDark: boolean, level: 1 | 2 | 3): ViewStyle {
  const r = level === 1 ? 6 : level === 2 ? 14 : 26;
  return {
    shadowColor: '#000',
    shadowOpacity: isDark ? 0.5 : level === 3 ? 0.16 : 0.1,
    shadowRadius: r,
    shadowOffset: { width: 0, height: Math.round(r / 2) },
    elevation: level * 4,
    borderWidth: isDark ? 1 : 0,
    borderColor: c.line,
  };
}

function Card({ children, style, level = 2 }: { children: ReactNode; style?: StyleProp<ViewStyle>; level?: 1 | 2 | 3 }) {
  const { c, isDark } = useR2Theme();
  return <View style={[s.card, { backgroundColor: c.surface }, lift(c, isDark, level), style]}>{children}</View>;
}

function Pill({
  label,
  onPress,
  tone = 'surface',
  icon,
  disabled,
  testID,
  big,
}: {
  label: string;
  onPress: () => void;
  tone?: 'surface' | 'ink' | 'right' | 'wrong' | 'flat';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  testID?: string;
  big?: boolean;
}) {
  const { c, f, isDark } = useR2Theme();
  const bg =
    tone === 'ink' ? c.ink : tone === 'right' ? c.right : tone === 'wrong' ? c.wrong : tone === 'flat' ? c.surface2 : c.surface;
  const fg = tone === 'ink' ? c.onInk : tone === 'right' ? c.onRight : tone === 'wrong' ? c.onWrong : c.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.pill,
        big ? s.pillBig : null,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ translateY: pressed ? 2 : 0 }] },
        tone === 'flat' ? null : lift(c, isDark, pressed ? 1 : 2),
      ]}
    >
      {icon ? <Ionicons name={icon} size={big ? 20 : 16} color={fg} /> : null}
      <Text style={[big ? s.pillTextBig : s.pillText, { color: fg, fontFamily: f.uiBold }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function RoundButton({ icon, onPress, label }: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  const { c, isDark } = useR2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [s.round, { backgroundColor: c.surface, transform: [{ translateY: pressed ? 1 : 0 }] }, lift(c, isDark, 1)]}
    >
      <Ionicons name={icon} size={19} color={c.text} />
    </Pressable>
  );
}

function Chip({ value, size, used, lit, onPress, label }: { value: number; size: number; used: boolean; lit: boolean; onPress: () => void; label: string }) {
  const { c, f, isDark } = useR2Theme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.chip,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: lit ? c.right : used ? 'transparent' : c.surface,
          borderColor: used ? c.lineStrong : lit ? c.right : c.surface3,
          borderStyle: used ? 'dashed' : 'solid',
          borderWidth: used ? 1.5 : 3,
          transform: [{ translateY: pressed && !used ? 2 : 0 }],
        },
        used ? null : lift(c, isDark, pressed ? 1 : 1),
      ]}
    >
      <Text
        style={[
          TABULAR,
          { fontSize: size * 0.3, color: lit ? c.onRight : used ? c.faint : c.text, fontFamily: f.display },
        ]}
      >
        {used ? '' : value}
      </Text>
    </Pressable>
  );
}

function Seat({ name, score, on, compact }: { name: string; score: number; on: boolean; compact?: boolean }) {
  const { c, f, isDark } = useR2Theme();
  return (
    <View
      style={[
        s.seat,
        compact ? s.seatCompact : null,
        { backgroundColor: on ? c.surface : c.surface2, transform: [{ translateY: on ? -3 : 0 }] },
        on ? lift(c, isDark, 2) : null,
      ]}
    >
      <View style={[s.avatar, { backgroundColor: on ? c.text : c.surface3 }]}>
        <Text style={[s.avatarText, { color: on ? c.bg : c.muted, fontFamily: f.uiBold }]}>{initials(name)}</Text>
      </View>
      <Text style={[s.seatName, { color: c.text, fontFamily: on ? f.uiBold : f.uiMedium }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[s.seatScore, TABULAR, { color: c.text, fontFamily: f.display }]}>
        <CountUp value={score} duration={520} from={score} />
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ home */

export function TabletopHome({ modes, tokens, tokensLabel, onSelectMode, onOpenSettings, onOpenStore, resume }: R2HomeProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const padX = Math.max(insets.left, insets.right, 20);
  const n = modes.length;
  const cardW = portrait ? (width - padX * 2 - 14) / 2 : Math.min(200, (width - padX * 2) / (n + 0.1));
  const cardH = portrait ? cardW * 1.3 : Math.min(height - 120, cardW * 1.38);
  const fan = [-8, -2.5, 2.5, 8];

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 12) }]}>
        <Text style={[s.brand, { color: c.text, fontFamily: f.display }]}>BackFire</Text>
        <View style={[s.row, { gap: 10 }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${tokensLabel}: ${tokens}`} onPress={onOpenStore} style={[s.tokenPill, { backgroundColor: c.surface2 }]}>
            <View style={[s.tokenCoin, { borderColor: c.text }]} />
            <Text style={[s.tokenText, TABULAR, { color: c.text, fontFamily: f.uiBold }]}>{tokens}</Text>
          </Pressable>
          <RoundButton icon="settings-outline" label="Settings" onPress={onOpenSettings} />
        </View>
      </View>
      <View style={[s.fill, portrait ? s.homeGrid : s.homeFan, { paddingHorizontal: padX }]}>
        {modes.map((mode, i) => {
          const rot = portrait ? (i % 2 === 0 ? -1.5 : 1.5) : fan[i] ?? 0;
          const drop = portrait ? 0 : Math.abs(rot) * 2.2;
          return (
            <Enter
              key={mode.id}
              delay={100 + i * 90}
              duration={560}
              dy={portrait ? 30 : 120}
              dx={portrait ? 0 : (1.5 - i) * 60}
              rotate={portrait ? 0 : -rot * 3}
              style={{
                width: cardW,
                height: cardH,
                marginHorizontal: portrait ? 0 : -cardW * 0.015,
                marginTop: drop,
                transform: [{ rotate: `${rot}deg` }],
                zIndex: mode.id === 'classic' ? 5 : i,
              }}
            >
              <Pressable
                testID={`home-mode-card-${mode.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${mode.title}. ${mode.copy}`}
                onPress={() => onSelectMode(mode.id)}
                style={({ pressed }) => [s.fill, { transform: [{ translateY: pressed ? -8 : 0 }, { scale: pressed ? 1.02 : 1 }] }]}
              >
                <Card level={3} style={[s.fill, s.modeCard]}>
                  <View style={[s.modeCorner]}>
                    <Text style={[s.modeCornerNum, { color: c.text, fontFamily: f.display }]}>{i + 1}</Text>
                    <Ionicons name={mode.icon as keyof typeof Ionicons.glyphMap} size={14} color={c.muted} />
                  </View>
                  <View style={[s.modeArt, { backgroundColor: c.surface2 }]}>
                    <Ionicons name={mode.icon as keyof typeof Ionicons.glyphMap} size={Math.round(cardW * 0.26)} color={c.text} />
                  </View>
                  <Text style={[s.modeTitle, { color: c.text, fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>
                    {mode.title}
                  </Text>
                  <Text style={[s.modeCopy, { color: c.muted, fontFamily: f.uiMedium }]} numberOfLines={3}>
                    {mode.copy}
                  </Text>
                  <View style={[s.modeCost, { backgroundColor: c.surface2 }]}>
                    <View style={[s.tokenCoinSm, { borderColor: c.text }]} />
                    <Text style={[s.modeCostText, TABULAR, { color: c.text, fontFamily: f.uiBold }]}>{mode.cost}</Text>
                  </View>
                </Card>
              </Pressable>
            </Enter>
          );
        })}
      </View>
      <Text style={[s.hint, { color: c.faint, fontFamily: f.uiMedium, paddingBottom: Math.max(insets.bottom, 10) }]}>Pick a card to deal a game</Text>
      {resume ? (
        <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: c.scrim }]} testID="home-resume-overlay">
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={resume.onClose} style={StyleSheet.absoluteFill} />
          <Enter dy={60} rotate={-4} duration={520}>
            <Card level={3} style={s.sheet}>
              <Text style={[s.sheetTitle, { color: c.text, fontFamily: f.display }]}>{resume.title}</Text>
              <Text style={[s.sheetBody, { color: c.muted, fontFamily: f.uiMedium }]}>{resume.body}</Text>
              <View style={[s.row, { gap: 10, marginTop: 14 }]}>
                <Pill label={resume.newLabel} onPress={resume.onNewGame} tone="flat" />
                <Pill label={resume.continueLabel} onPress={resume.onContinue} icon="play" />
              </View>
            </Card>
          </Enter>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------------------------------------- lobby */

export function TabletopLobby(p: R2LobbyProps) {
  const { c, f, isDark } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const padX = Math.max(insets.left, insets.right, 20);
  const { session } = p;
  const teams = session.teams;

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 10) }]}>
        <RoundButton icon="chevron-back" label={t('common.back')} onPress={p.onBack} />
        <Text style={[s.screenTitle, { color: c.text, fontFamily: f.display }]}>{t('play.teamSetupTitle')}</Text>
        <View style={{ width: 42 }} />
      </View>
      <View style={[s.fill, s.row, { paddingHorizontal: padX, gap: 18, alignItems: 'stretch', paddingVertical: 6 }]}>
        {teams.map((team, i) => (
          <Enter key={team.id} delay={80 + i * 100} dy={50} rotate={i % 2 ? 6 : -6} duration={540} style={[s.fill, { transform: [{ rotate: `${i % 2 ? 1.2 : -1.2}deg` }] }]}>
            <Card level={3} style={[s.fill, s.teamCard]}>
              <View style={s.row}>
                <View style={s.avatarStack}>
                  {(team.playerNames ?? []).slice(0, 4).map((name, j) => (
                    <View key={j} style={[s.avatarLg, { backgroundColor: j === 0 ? c.text : c.surface3, borderColor: c.surface, marginLeft: j ? -10 : 0 }]}>
                      <Text style={[s.avatarText, { color: j === 0 ? c.bg : c.text, fontFamily: f.uiBold }]}>{initials(name || `P${j + 1}`)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[s.teamTag, { color: c.faint, fontFamily: f.uiBold }]}>{`TEAM ${i + 1}`}</Text>
              </View>
              <TextInput
                value={team.name}
                onChangeText={(v) => p.updateTeamName(team.id, v)}
                placeholder={t('play.teamNamePlaceholder')}
                placeholderTextColor={c.faint}
                style={[s.teamName, { color: c.text, fontFamily: f.display, backgroundColor: c.surface2 }]}
                maxLength={24}
              />
              <ScrollView style={s.fill} contentContainerStyle={s.playerWrap} showsVerticalScrollIndicator={false}>
                {(team.playerNames ?? []).map((name, j) => (
                  <View key={j} style={[s.playerChip, { backgroundColor: c.surface2 }]}>
                    <TextInput
                      value={name}
                      onChangeText={(v) => p.updateTeamMemberName(team.id, j, v)}
                      placeholder={t('play.playerPlaceholder', { count: j + 1 })}
                      placeholderTextColor={c.faint}
                      style={[s.playerInput, { color: c.text, fontFamily: f.uiSemi }]}
                      maxLength={20}
                    />
                  </View>
                ))}
                <Pressable accessibilityRole="button" accessibilityLabel={t('play.addTeamMemberA11y')} onPress={() => p.addTeamMember(team.id)} style={[s.playerChip, s.addChip, { borderColor: c.lineStrong }]}>
                  <Ionicons name="add" size={16} color={c.muted} />
                </Pressable>
                {(team.playerNames ?? []).length > 1 ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={t('play.removeTeamMemberA11y')} onPress={() => p.removeTeamMember(team.id)} style={[s.playerChip, s.addChip, { borderColor: c.lineStrong }]}>
                    <Ionicons name="remove" size={16} color={c.muted} />
                  </Pressable>
                ) : null}
              </ScrollView>
            </Card>
          </Enter>
        ))}
        {p.wagerEnabled ? (
          <Enter delay={320} dy={40} style={s.wagerCol}>
            <Text style={[s.teamTag, { color: c.muted, fontFamily: f.uiBold, textAlign: 'center' }]}>{t('play.wagerCardTitle').toUpperCase()}</Text>
            <View style={s.chipStack}>
              {Array.from({ length: Math.max(1, session.wagersPerTeam) }).map((_, k) => (
                <View
                  key={k}
                  style={[
                    s.stackChip,
                    { backgroundColor: session.wagersPerTeam ? c.surface : 'transparent', borderColor: session.wagersPerTeam ? c.text : c.lineStrong, bottom: k * 6, zIndex: k },
                    session.wagersPerTeam ? lift(c, isDark, 1) : null,
                  ]}
                />
              ))}
              <Text style={[s.stackNum, TABULAR, { color: c.text, fontFamily: f.display, bottom: Math.max(1, session.wagersPerTeam) * 6 + 26 }]}>
                {session.wagersPerTeam}
              </Text>
            </View>
            <View style={[s.row, { gap: 8 }]}>
              <RoundButton icon="remove" label="Fewer wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam - 1)} />
              <RoundButton icon="add" label="More wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam + 1)} />
            </View>
            <Pressable accessibilityRole="button" onPress={p.onWagerInfo}>
              <Text style={[s.hint, { color: c.muted, fontFamily: f.uiMedium }]}>{t('play.wagerHelpLink')}</Text>
            </Pressable>
          </Enter>
        ) : null}
      </View>
      <View style={[s.row, { justifyContent: 'flex-end', paddingHorizontal: padX, paddingBottom: Math.max(insets.bottom, 12), paddingTop: 6 }]}>
        <Pill
          testID="team-setup-continue"
          label={p.canContinue ? t('play.continueToTopics') : t('play.setupIncompleteHint')}
          icon="arrow-forward"
          disabled={!p.canContinue}
          onPress={p.onContinue}
          big
        />
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- board */

export function TabletopBoard(p: R2BoardProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padX = Math.max(insets.left, insets.right, 16);
  const cols = p.columns;
  const n = Math.max(1, cols.length);
  const gap = 12;
  const cardW = Math.min(170, (width - padX * 2 - gap * (n - 1)) / n);
  const seatH = 50;
  const cardH = height - Math.max(insets.top, 8) - seatH - 20 - Math.max(insets.bottom, 10);
  const rows = Math.max(1, ...cols.map((col) => col.rows.length));
  const artH = Math.max(32, cardH * 0.3);
  const chipSize = Math.max(26, Math.min((cardW - 28) / 2, (cardH - artH - 44) / rows - 6));

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.seatBar, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 8), height: seatH + Math.max(insets.top, 8) + 6 }]}>
        <RoundButton icon="chevron-back" label={t('common.back')} onPress={p.onBack} />
        <View style={[s.row, s.fill, { gap: 10, justifyContent: 'center' }]}>
          {p.session.teams.map((team) => (
            <Seat key={team.id} name={team.name} score={team.score} on={team.id === p.session.currentTeamId} compact={p.session.teams.length > 2} />
          ))}
        </View>
        <RoundButton icon="ellipsis-horizontal" label={t('play.matchMenuA11y')} onPress={p.onMenu} />
      </View>
      <View style={[s.fill, s.row, { justifyContent: 'center', gap, paddingHorizontal: padX, paddingBottom: Math.max(insets.bottom, 10) }]}>
        {cols.map((col, ci) => {
          const art = p.art(col.categoryId);
          const tilt = ((ci % 3) - 1) * 0.8;
          return (
            <Enter key={col.categoryId} delay={ci * 80} duration={520} dy={80} dx={(ci - n / 2) * -30} rotate={tilt * 6} style={{ width: cardW, height: cardH, transform: [{ rotate: `${tilt}deg` }] }}>
              <Card level={2} style={[s.fill, s.catCard]}>
                <View style={[s.catArt, { height: artH, backgroundColor: c.surface2 }]}>
                  {art ? <Image source={art} style={{ width: artH * 0.9, height: artH * 0.9 }} contentFit="contain" /> : null}
                </View>
                <Text style={[s.catName, { color: c.text, fontFamily: f.display }]} numberOfLines={1} adjustsFontSizeToFit>
                  {col.categoryName}
                </Text>
                <View style={[s.fill, { justifyContent: 'space-evenly' }]}>
                  {col.rows.map((row) => (
                    <View key={row.pointValue} style={[s.row, { justifyContent: 'space-evenly' }]}>
                      {[row.left, row.right].map((q, side) => (
                        <Chip
                          key={q.id + side}
                          value={q.pointValue}
                          size={chipSize}
                          used={p.isUsed(q)}
                          lit={p.flashingId === q.id || p.lockedId === q.id}
                          onPress={() => p.onTilePress(q)}
                          label={`${col.categoryName}, ${q.pointValue} points`}
                        />
                      ))}
                    </View>
                  ))}
                </View>
              </Card>
            </Enter>
          );
        })}
      </View>
    </View>
  );
}

/* -------------------------------------------------------- question/answer */

export function TabletopQuestion(p: R2QuestionProps) {
  const { c, f, isDark } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const reduce = useReducedMotion();
  const padX = Math.max(insets.left, insets.right, 16);
  const q = p.question;
  const session = p.session;
  const review = Boolean(session.reviewingUsedQuestion);
  const wagerQ = Boolean(session.wager?.question);
  const scored = session.phase === 'scoring';
  const teams = awardableTeams(session, q);
  const progress = Math.min(1, p.elapsedSeconds / Math.max(1, p.maxSeconds));

  const cardW = Math.min(width * (p.isAnswerPhase ? 0.5 : 0.66), 620);
  const cardH = Math.min(height - (p.isAnswerPhase ? 70 : 120) - Math.max(insets.top, 8) - Math.max(insets.bottom, 8), cardW * 0.62);
  const qSize = fitFontSize(q.prompt, cardW - 56, cardH - 90, 30, 13, 0.55, 1.2);
  const aSize = fitFontSize(q.answer, cardW - 56, cardH - 80, 44, 16, 0.58, 1.1);

  // The card turns over: 0 = question face, 1 = answer face.
  const flip = useRef(new Animated.Value(p.isAnswerPhase ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) {
      flip.setValue(p.isAnswerPhase ? 1 : 0);
      return;
    }
    Animated.timing(flip, { toValue: p.isAnswerPhase ? 1 : 0, duration: 620, easing: EASE_OUT, useNativeDriver: NATIVE }).start();
  }, [flip, p.isAnswerPhase, reduce]);
  const frontRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRot = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const frontOp = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [1, 1, 0, 0] });
  const backOp = flip.interpolate({ inputRange: [0, 0.5, 0.51, 1], outputRange: [0, 0, 1, 1] });

  const face: ViewStyle = { width: cardW, height: cardH, borderRadius: 28, backfaceVisibility: 'hidden' };

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 8) }]}>
        <RoundButton icon="chevron-back" label={t('common.back')} onPress={p.onBack} />
        <View style={[s.timerPill, { backgroundColor: c.surface2 }]}>
          <View style={[s.timerPillFill, { width: `${progress * 100}%`, backgroundColor: p.hasTimedOut ? c.wrongSoft : c.surface3 }]} />
          <Ionicons name="time-outline" size={14} color={p.hasTimedOut ? c.wrong : c.text} />
          <Text style={[s.timerText, TABULAR, { color: p.hasTimedOut ? c.wrong : c.text, fontFamily: f.uiBold }]}>{p.timeLabel}</Text>
        </View>
        <RoundButton icon="flag-outline" label={t('play.report.buttonA11y')} onPress={p.onReport} />
      </View>

      <View style={[s.fill, p.isAnswerPhase ? s.row : s.center, { paddingHorizontal: padX, gap: 22, justifyContent: 'center' }]}>
        <Enter revealKey={q.id} dy={70} rotate={-5} duration={560} style={{ width: cardW, height: cardH }}>
          {/* deck underneath */}
          <View style={[face, s.abs, { backgroundColor: c.surface2, transform: [{ rotate: '3deg' }, { translateY: 6 }] }]} />
          <View style={[face, s.abs, { backgroundColor: c.surface3, transform: [{ rotate: '-2deg' }, { translateY: 3 }] }]} />
          {/* question face */}
          <Animated.View style={[face, s.abs, s.faceInner, { backgroundColor: c.surface, opacity: frontOp, transform: [{ perspective: 1200 }, { rotateY: frontRot }] }, lift(c, isDark, 3)]}>
            <View style={s.faceHead}>
              <View style={[s.valueChip, { borderColor: c.text }]}>
                <Text style={[s.valueChipText, TABULAR, { color: c.text, fontFamily: f.display }]}>{q.pointValue}</Text>
              </View>
              <Text style={[s.faceCat, { color: c.muted, fontFamily: f.uiBold }]} numberOfLines={1}>
                {q.categoryName.toUpperCase()}
              </Text>
            </View>
            <View style={[s.fill, s.center]}>
              <Text testID="question-prompt" style={[s.qText, { color: c.text, fontFamily: f.displaySemi, fontSize: qSize, lineHeight: Math.round(qSize * 1.2) }]}>
                {q.prompt}
              </Text>
              {p.promptImage ? <Image source={p.promptImage} style={s.qImage} contentFit="contain" /> : null}
            </View>
            {p.guide ? <Text style={[s.guide, { color: c.muted, fontFamily: f.uiMedium }]}>{p.guide}</Text> : null}
          </Animated.View>
          {/* answer face */}
          <Animated.View
            testID="question-answer-box"
            style={[face, s.abs, s.faceInner, { backgroundColor: c.ink, opacity: backOp, transform: [{ perspective: 1200 }, { rotateY: backRot }] }, lift(c, isDark, 3)]}
          >
            <View style={s.faceHead}>
              <View style={[s.valueChip, { borderColor: c.onInk }]}>
                <Text style={[s.valueChipText, TABULAR, { color: c.onInk, fontFamily: f.display }]}>{q.pointValue}</Text>
              </View>
              <Text style={[s.faceCat, { color: c.inkMuted, fontFamily: f.uiBold }]} numberOfLines={1}>
                {(p.hasTimedOut ? t('play.timeUpTitle') : t('play.correctAnswer')).toUpperCase()}
              </Text>
            </View>
            <View style={[s.fill, s.center]}>
              <Text style={[s.aText, { color: c.onInk, fontFamily: f.display, fontSize: aSize, lineHeight: Math.round(aSize * 1.1) }]}>{q.answer}</Text>
            </View>
            <Text style={[s.guide, { color: c.inkMuted, fontFamily: f.uiMedium }]} numberOfLines={2}>
              {q.prompt}
            </Text>
          </Animated.View>
        </Enter>

        {!p.isAnswerPhase ? null : (
          <Enter delay={420} dx={40} dy={0} style={s.awardPanel}>
            {review ? (
              <Pill label={t('play.phase.board')} icon="grid-outline" onPress={p.onBack} big />
            ) : wagerQ ? (
              <>
                <Text style={[s.awardTitle, { color: c.text, fontFamily: f.display }]}>{t('play.wagerCardTitle')}</Text>
                <Pill label="Right" tone="right" icon="checkmark" onPress={() => p.onResolveWager(true)} big />
                <Pill label="Wrong" tone="wrong" icon="close" onPress={() => p.onResolveWager(false)} big />
              </>
            ) : (
              <>
                <Text style={[s.awardTitle, { color: c.text, fontFamily: f.display }]}>{p.hasTimedOut ? t('play.noPointsAwarded') : t('play.whoGetsPoints')}</Text>
                <View style={[s.row, { gap: 8, flexWrap: 'wrap' }]}>
                  {teams.map((team) => {
                    const chosen = scored && session.lastAwardedTeamId === team.id;
                    return (
                      <Pill
                        key={team.id}
                        label={`${team.name} +${q.pointValue}`}
                        tone={chosen ? 'right' : 'surface'}
                        icon={chosen ? 'checkmark-circle' : 'person-circle-outline'}
                        disabled={p.hasTimedOut}
                        onPress={() => p.onAward(team.id)}
                      />
                    );
                  })}
                  <Pill
                    label={t('play.neitherTeam')}
                    tone={scored && session.lastAwardedTeamId === null ? 'wrong' : 'flat'}
                    icon={scored && session.lastAwardedTeamId === null ? 'close-circle' : 'close-circle-outline'}
                    disabled={p.hasTimedOut}
                    onPress={() => p.onAward(null)}
                  />
                </View>
                <View style={s.fill} />
                <View style={[s.row, { gap: 8 }]}>
                  {p.canWager ? <Pill label="Wager" tone="flat" icon="swap-horizontal" onPress={p.onWager} /> : null}
                  <Pill
                    label={session.bonus.active ? t('play.finishMatch') : t('play.nextTurn')}
                    icon="arrow-forward"
                    disabled={!scored}
                    onPress={p.onNext}
                    big
                  />
                </View>
              </>
            )}
          </Enter>
        )}
      </View>

      {!p.isAnswerPhase ? (
        <View style={[s.center, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pill testID="question-show-answer" label={t('play.showAnswer')} tone="ink" icon="sync" onPress={p.onShowAnswer} disabled={!p.canShowAnswer} big />
        </View>
      ) : (
        <View style={{ height: Math.max(insets.bottom, 12) }} />
      )}
    </View>
  );
}

/* --------------------------------------------------------------- results */

export function TabletopResults(p: R2ResultsProps) {
  const { c, f, isDark } = useR2Theme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const padX = Math.max(insets.left, insets.right, 20);
  const ranked = rankTeams(p.session.teams);
  const tie = isTie(p.session.teams);
  const winner = ranked[0]!;
  const others = ranked.slice(1);
  const recap = useMemo(() => buildRecap(p.session), [p.session]);
  const cardW = Math.min(300, width * 0.34);
  const cardH = Math.min(height - 130, cardW * 1.1);

  return (
    <View style={[s.fill, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { paddingHorizontal: padX, paddingTop: Math.max(insets.top, 10) }]}>
        <Text style={[s.screenTitle, { color: c.text, fontFamily: f.display }]}>{t('play.matchComplete')}</Text>
        <Pressable accessibilityRole="button" onPress={p.onReviewBoard} style={[s.tokenPill, { backgroundColor: c.surface2 }]}>
          <Ionicons name="grid-outline" size={14} color={c.text} />
          <Text style={[s.tokenText, { color: c.text, fontFamily: f.uiBold }]}>{t('play.questionBoardTitle')}</Text>
        </Pressable>
      </View>
      <View style={[s.fill, s.row, { paddingHorizontal: padX, gap: 26, justifyContent: 'center' }]}>
        <View style={{ width: cardW + 40, height: cardH, alignItems: 'center', justifyContent: 'center' }}>
          {others.map((team, i) => (
            <Enter key={team.id} delay={100 + i * 80} dy={60} rotate={10} style={[s.abs, { width: cardW * 0.92, height: cardH * 0.92, transform: [{ rotate: `${i % 2 ? 7 : -7}deg` }, { translateX: i % 2 ? 90 : -90 }] }]}>
              <Card level={1} style={[s.fill, s.loserCard]}>
                <Text style={[s.loserName, { color: c.muted, fontFamily: f.uiBold }]} numberOfLines={1}>{team.name}</Text>
                <Text style={[s.loserScore, TABULAR, { color: c.muted, fontFamily: f.display }]}>{team.score}</Text>
              </Card>
            </Enter>
          ))}
          <Enter delay={380} duration={700} dy={-140} rotate={-14} scale={1.15} style={{ width: cardW, height: cardH }}>
            <View style={[s.fill, s.winCard, { backgroundColor: c.surface }, lift(c, isDark, 3)]}>
              <View style={[s.trophy, { backgroundColor: c.text }]}>
                <Ionicons name="trophy" size={26} color={c.bg} />
              </View>
              <Text style={[s.teamTag, { color: c.muted, fontFamily: f.uiBold, textAlign: 'center' }]}>
                {(tie ? t('play.tieGame') : t('play.winner')).toUpperCase()}
              </Text>
              <Text style={[s.winName, { color: c.text, fontFamily: f.display }]} numberOfLines={2} adjustsFontSizeToFit>
                {winner.name}
              </Text>
              <Text style={[s.winScore, TABULAR, { color: c.text, fontFamily: f.display }]}>
                <CountUp value={winner.score} duration={1200} />
              </Text>
            </View>
          </Enter>
        </View>
        <Enter delay={600} dx={40} dy={0} style={s.resultSide}>
          <Text style={[s.awardTitle, { color: c.text, fontFamily: f.display }]}>How the night went</Text>
          <View style={s.recapChips}>
            {recap.map((r, i) => (
              <Enter key={r.question.id} delay={700 + i * 30} dy={-12} scale={0.4} duration={320}>
                <View style={[s.recapChip, { backgroundColor: r.right ? c.right : c.wrong }]}>
                  <Ionicons name={r.right ? 'checkmark' : 'close'} size={11} color={r.right ? c.onRight : c.onWrong} />
                </View>
              </Enter>
            ))}
          </View>
          <Text style={[s.hint, { color: c.muted, fontFamily: f.uiMedium, textAlign: 'left' }]}>
            {`${recap.filter((r) => r.right).length} right, ${recap.filter((r) => !r.right).length} wrong`}
          </Text>
          <View style={s.fill} />
          <View style={{ gap: 10 }}>
            <Pill label={t('play.startAnotherMatch')} icon="refresh" onPress={p.onAnotherMatch} big />
            <Pill label={t('play.backToHome')} tone="flat" icon="home-outline" onPress={p.onHome} />
          </View>
        </Enter>
      </View>
      <View style={{ height: Math.max(insets.bottom, 12) }} />
    </View>
  );
}

/* ---------------------------------------------------------------- styles */

const s = StyleSheet.create({
  fill: { flex: 1 },
  abs: { position: 'absolute' },
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 24 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, paddingHorizontal: 18, borderRadius: 22 },
  pillBig: { height: 54, paddingHorizontal: 26, borderRadius: 27 },
  pillText: { fontSize: 14 },
  pillTextBig: { fontSize: 16 },
  round: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  chip: { alignItems: 'center', justifyContent: 'center' },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 44, borderRadius: 22, paddingLeft: 4, paddingRight: 16, maxWidth: 260 },
  seatCompact: { maxWidth: 170, paddingRight: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, letterSpacing: 0.5 },
  seatName: { fontSize: 13, flexShrink: 1 },
  seatScore: { fontSize: 20 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  brand: { fontSize: 24, letterSpacing: -0.5 },
  tokenPill: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, borderRadius: 18, paddingHorizontal: 14 },
  tokenCoin: { width: 14, height: 14, borderRadius: 7, borderWidth: 2.5 },
  tokenCoinSm: { width: 11, height: 11, borderRadius: 6, borderWidth: 2 },
  tokenText: { fontSize: 14 },
  homeFan: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  homeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'center', alignContent: 'center' },
  modeCard: { padding: 14 },
  modeCorner: { position: 'absolute', top: 12, left: 14, alignItems: 'center', gap: 2 },
  modeCornerNum: { fontSize: 18 },
  modeArt: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginLeft: 26, marginBottom: 10 },
  modeTitle: { fontSize: 20, letterSpacing: -0.3 },
  modeCopy: { fontSize: 11, lineHeight: 14, marginTop: 3 },
  modeCost: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, height: 24, paddingHorizontal: 10, borderRadius: 12 },
  modeCostText: { fontSize: 11 },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 4 },
  sheet: { width: 420, padding: 24 },
  sheetTitle: { fontSize: 22 },
  sheetBody: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  screenTitle: { fontSize: 20, letterSpacing: -0.3 },
  teamCard: { padding: 16, gap: 10 },
  avatarStack: { flexDirection: 'row', flex: 1 },
  avatarLg: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  teamTag: { fontSize: 10, letterSpacing: 1.8 },
  teamName: { fontSize: 24, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, letterSpacing: -0.3 },
  playerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  playerChip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center', minWidth: 44 },
  addChip: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', backgroundColor: 'transparent' },
  playerInput: { fontSize: 14, width: 84, paddingVertical: 0 },
  wagerCol: { width: 120, alignItems: 'center', justifyContent: 'center', gap: 12 },
  chipStack: { width: 70, height: 110, alignItems: 'center', justifyContent: 'flex-end' },
  stackChip: { position: 'absolute', width: 64, height: 22, borderRadius: 32, borderWidth: 3 },
  stackNum: { position: 'absolute', fontSize: 30 },
  seatBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catCard: { padding: 8, alignItems: 'stretch' },
  catArt: { borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  catName: { fontSize: 14, textAlign: 'center', marginVertical: 5, letterSpacing: -0.2 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, borderRadius: 17, paddingHorizontal: 14, overflow: 'hidden', minWidth: 110, justifyContent: 'center' },
  timerPillFill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  timerText: { fontSize: 14 },
  faceInner: { padding: 22, overflow: 'hidden' },
  faceHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  valueChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  valueChipText: { fontSize: 14 },
  faceCat: { fontSize: 11, letterSpacing: 1.8, flex: 1 },
  qText: { textAlign: 'center', letterSpacing: -0.3 },
  qImage: { width: '80%', height: 80, marginTop: 8 },
  aText: { textAlign: 'center', letterSpacing: -0.6 },
  guide: { fontSize: 11, textAlign: 'center' },
  awardPanel: { flex: 1, maxWidth: 360, alignSelf: 'stretch', paddingVertical: 10, gap: 12 },
  awardTitle: { fontSize: 18, letterSpacing: -0.2 },
  loserCard: { padding: 18, justifyContent: 'flex-end' },
  loserName: { fontSize: 13 },
  loserScore: { fontSize: 26 },
  winCard: { borderRadius: 28, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 6 },
  trophy: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  winName: { fontSize: 28, textAlign: 'center', letterSpacing: -0.5 },
  winScore: { fontSize: 52, letterSpacing: -2 },
  resultSide: { width: 300, alignSelf: 'stretch', paddingVertical: 16, gap: 10 },
  recapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  recapChip: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
