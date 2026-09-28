/**
 * Direction B: EDITORIAL. The game as a beautifully set magazine.
 * An asymmetric two-column grid (a narrow folio rail and a wide page), serif
 * display type for questions and answers, hairline rules instead of cards,
 * numbered indexes and a ruled board table. Premium through restraint:
 * whitespace, typographic contrast and exact alignment carry the hierarchy.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '@/components/ui/Pressable';
import { useI18n } from '@/lib/i18n/useI18n';
import { TABULAR, useR2Theme } from './theme';
import {
  CountUp,
  Enter,
  awardableTeams,
  buildRecap,
  fitFontSize,
  isTie,
  rankTeams,
  type R2BoardProps,
  type R2HomeProps,
  type R2LobbyProps,
  type R2QuestionProps,
  type R2ResultsProps,
} from './shared';

/* ------------------------------------------------------------ primitives */

function Label({ children, color }: { children: string; color: string }) {
  const { f } = useR2Theme();
  return <Text style={[s.label, { color, fontFamily: f.uiSemi }]}>{children.toUpperCase()}</Text>;
}

function Rule({ strong }: { strong?: boolean }) {
  const { c } = useR2Theme();
  return <View style={{ height: strong ? 2 : StyleSheet.hairlineWidth, backgroundColor: strong ? c.text : c.lineStrong }} />;
}

function TextLink({
  label,
  onPress,
  strong,
  disabled,
  testID,
  color,
}: {
  label: string;
  onPress: () => void;
  strong?: boolean;
  disabled?: boolean;
  testID?: string;
  color?: string;
}) {
  const { c, f } = useR2Theme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.textLink, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Text
        style={[
          strong ? s.textLinkStrong : s.textLinkQuiet,
          {
            color: color ?? c.text,
            fontFamily: strong ? f.uiSemi : f.uiMedium,
            textDecorationLine: 'underline',
            textDecorationColor: color ?? c.text,
          },
        ]}
      >
        {label}
      </Text>
      <Ionicons name="arrow-forward" size={strong ? 16 : 13} color={color ?? c.text} />
    </Pressable>
  );
}

/** A left folio rail + a wide page. */
function Spread({ rail, children, railWidth = 0.3 }: { rail: React.ReactNode; children: React.ReactNode; railWidth?: number }) {
  const { c } = useR2Theme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const portrait = height > width;
  const padX = Math.max(insets.left, insets.right, 24);
  if (portrait) {
    return (
      <View style={[s.fill, { backgroundColor: c.bg, paddingHorizontal: padX, paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={{ paddingBottom: 12, height: Math.min(230, height * 0.28) }}>{rail}</View>
        <Rule strong />
        <View style={s.fill}>{children}</View>
      </View>
    );
  }
  return (
    <View
      style={[
        s.fill,
        s.rowTop,
        {
          backgroundColor: c.bg,
          paddingLeft: padX,
          paddingRight: padX,
          paddingTop: Math.max(insets.top, 18),
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}
    >
      <View style={[s.rail, { width: `${railWidth * 100}%`, borderRightColor: c.lineStrong }]}>{rail}</View>
      <View style={[s.fill, { paddingLeft: 26 }]}>{children}</View>
    </View>
  );
}

function Masthead() {
  const { c, f } = useR2Theme();
  return (
    <View>
      <Text style={[s.mast, { color: c.text, fontFamily: f.serif }]}>BackFire</Text>
      <Text style={[s.mastSub, { color: c.muted, fontFamily: f.serif }]}>The trivia quarterly</Text>
    </View>
  );
}

function IconLink({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  const { c, f } = useR2Theme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [s.iconLink, { opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={15} color={c.text} />
      <Text style={[s.iconLinkText, { color: c.text, fontFamily: f.uiMedium }]}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ home */

export function EditorialHome({ modes, tokens, tokensLabel, onSelectMode, onOpenSettings, onOpenStore, resume }: R2HomeProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const rail = (
    <View style={s.fill}>
      <Masthead />
      <View style={s.fill} />
      <Label color={c.muted}>{tokensLabel}</Label>
      <Text style={[s.railNum, TABULAR, { color: c.text, fontFamily: f.serif }]}>{tokens}</Text>
      <View style={{ height: 10 }} />
      <IconLink icon="bag-outline" label="Store" onPress={onOpenStore} />
      <IconLink icon="settings-outline" label="Settings" onPress={onOpenSettings} />
    </View>
  );
  return (
    <>
      <Spread rail={rail}>
        <Label color={c.muted}>{`In this issue · ${modes.length} ways to play`}</Label>
        <View style={{ height: 8 }} />
        <Rule strong />
        <ScrollView style={s.fill} contentContainerStyle={{ flexGrow: 1 }}>
          {modes.map((mode, i) => (
            <Enter key={mode.id} delay={80 + i * 70} dy={10} style={s.fill}>
              <Pressable
                testID={`home-mode-card-${mode.id}`}
                accessibilityRole="button"
                accessibilityLabel={`${mode.title}. ${mode.copy}`}
                onPress={() => onSelectMode(mode.id)}
                style={({ pressed }) => [s.indexRow, { borderBottomColor: c.lineStrong, backgroundColor: pressed ? c.surface2 : 'transparent' }]}
              >
                <Text style={[s.indexNo, TABULAR, { color: c.faint, fontFamily: f.serif }]}>{String(i + 1).padStart(2, '0')}</Text>
                <View style={s.fill}>
                  <Text style={[s.indexTitle, { color: c.text, fontFamily: f.serif }]}>{mode.title}</Text>
                  <Text style={[s.indexCopy, { color: c.muted, fontFamily: f.ui }]} numberOfLines={1}>
                    {mode.copy}
                  </Text>
                </View>
                <Text style={[s.indexCost, TABULAR, { color: c.muted, fontFamily: f.uiMedium }]}>{`${mode.cost} ${tokensLabel.toLowerCase()}`}</Text>
                <Ionicons name="arrow-forward" size={18} color={c.text} />
              </Pressable>
            </Enter>
          ))}
        </ScrollView>
      </Spread>
      {resume ? (
        <View style={[StyleSheet.absoluteFill, s.center, { backgroundColor: c.scrim }]} testID="home-resume-overlay">
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={resume.onClose} style={StyleSheet.absoluteFill} />
          <Enter style={[s.sheet, { backgroundColor: c.surface }]}>
            <Label color={c.muted}>Continue reading</Label>
            <Text style={[s.sheetTitle, { color: c.text, fontFamily: f.serif }]}>{resume.title}</Text>
            <Text style={[s.sheetBody, { color: c.muted, fontFamily: f.ui }]}>{resume.body}</Text>
            <Rule />
            <View style={[s.row, { justifyContent: 'space-between', marginTop: 12 }]}>
              <TextLink label={resume.newLabel} onPress={resume.onNewGame} />
              <TextLink label={resume.continueLabel} onPress={resume.onContinue} strong />
            </View>
          </Enter>
        </View>
      ) : null}
    </>
  );
}

/* ----------------------------------------------------------------- lobby */

export function EditorialLobby(p: R2LobbyProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const { session } = p;
  const rail = (
    <View style={s.fill}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack} style={s.backLink}>
        <Ionicons name="arrow-back" size={16} color={c.text} />
        <Text style={[s.iconLinkText, { color: c.text, fontFamily: f.uiMedium }]}>{t('common.back')}</Text>
      </Pressable>
      <Text style={[s.railTitle, { color: c.text, fontFamily: f.serif }]}>{t('play.teamSetupTitle')}</Text>
      <Text style={[s.railMeta, { color: c.muted, fontFamily: f.ui }]}>{t('play.teamSetupStepOf', { current: 1, total: 2 })}</Text>
      <View style={s.fill} />
      {p.wagerEnabled ? (
        <>
          <Label color={c.muted}>{t('play.wagersPerTeam')}</Label>
          <View style={[s.row, { gap: 14, marginTop: 4 }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Fewer wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam - 1)} style={[s.stepBtn, { borderColor: c.lineStrong }]}>
              <Ionicons name="remove" size={16} color={c.text} />
            </Pressable>
            <Text style={[s.railNum, TABULAR, { color: c.text, fontFamily: f.serif }]}>{session.wagersPerTeam}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="More wagers" onPress={() => p.setWagersPerTeam(session.wagersPerTeam + 1)} style={[s.stepBtn, { borderColor: c.lineStrong }]}>
              <Ionicons name="add" size={16} color={c.text} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={p.onWagerInfo}>
            <Text style={[s.footnote, { color: c.muted, fontFamily: f.serif }]}>{t('play.wagerInfoLink')}</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
  return (
    <Spread rail={rail}>
      <View style={[s.fill, s.rowTop, { gap: 26 }]}>
        {session.teams.map((team, i) => (
          <Enter key={team.id} delay={80 + i * 90} style={s.fill}>
            <Label color={c.faint}>{`Team ${i + 1}`}</Label>
            <TextInput
              value={team.name}
              onChangeText={(v) => p.updateTeamName(team.id, v)}
              placeholder={t('play.teamNamePlaceholder')}
              placeholderTextColor={c.faint}
              style={[s.teamName, { color: c.text, fontFamily: f.serif }]}
              maxLength={24}
            />
            <Rule strong />
            <ScrollView style={s.fill}>
              {(team.playerNames ?? []).map((name, j) => (
                <View key={j} style={[s.ledgerRow, { borderBottomColor: c.lineStrong }]}>
                  <Text style={[s.ledgerNo, TABULAR, { color: c.faint, fontFamily: f.serif }]}>{j + 1}.</Text>
                  <TextInput
                    value={name}
                    onChangeText={(v) => p.updateTeamMemberName(team.id, j, v)}
                    placeholder={t('play.playerPlaceholder', { count: j + 1 })}
                    placeholderTextColor={c.faint}
                    style={[s.ledgerInput, { color: c.text, fontFamily: f.ui }]}
                    maxLength={24}
                  />
                </View>
              ))}
              <View style={[s.row, { gap: 16, marginTop: 6 }]}>
                <Pressable accessibilityRole="button" onPress={() => p.addTeamMember(team.id)}>
                  <Text style={[s.footnote, { color: c.text, fontFamily: f.serif }]}>+ {t('play.addPlayerLink')}</Text>
                </Pressable>
                {(team.playerNames ?? []).length > 1 ? (
                  <Pressable accessibilityRole="button" onPress={() => p.removeTeamMember(team.id)}>
                    <Text style={[s.footnote, { color: c.muted, fontFamily: f.serif }]}>{t('play.removeLastPlayerLink')}</Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          </Enter>
        ))}
      </View>
      <View style={[s.row, { justifyContent: 'flex-end', paddingTop: 8 }]}>
        {!p.canContinue ? (
          <Text style={[s.footnote, { color: c.muted, fontFamily: f.serif, marginRight: 16 }]}>{t('play.setupIncompleteHint')}</Text>
        ) : null}
        <TextLink testID="team-setup-continue" label={t('play.continueToTopics')} onPress={p.onContinue} strong disabled={!p.canContinue} />
      </View>
    </Spread>
  );
}

/* ----------------------------------------------------------------- board */

export function EditorialBoard(p: R2BoardProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const session = p.session;
  const values = p.columns[0]?.rows.map((r) => r.pointValue) ?? [];
  const rowH = Math.max(
    30,
    Math.min(64, (height - Math.max(insets.top, 18) - Math.max(insets.bottom, 14) - 60) / Math.max(1, p.columns.length))
  );
  const rail = (
    <View style={s.fill}>
      <View style={[s.row, { gap: 16 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack}>
          <Ionicons name="arrow-back" size={18} color={c.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={t('play.matchMenuA11y')} onPress={p.onMenu}>
          <Ionicons name="ellipsis-horizontal" size={18} color={c.text} />
        </Pressable>
      </View>
      <Text style={[s.railTitle, { color: c.text, fontFamily: f.serif, marginTop: 10 }]}>Standings</Text>
      <Rule strong />
      {session.teams.map((team) => {
        const on = team.id === session.currentTeamId;
        return (
          <View key={team.id} style={[s.standRow, { borderBottomColor: c.lineStrong }]}>
            <View style={s.fill}>
              <Text style={[s.standName, { color: c.text, fontFamily: on ? f.uiSemi : f.ui }]} numberOfLines={1}>
                {team.name}
              </Text>
              {on ? <Text style={[s.toPlay, { color: c.muted, fontFamily: f.serif }]}>to choose</Text> : null}
            </View>
            <Text style={[s.standScore, TABULAR, { color: c.text, fontFamily: f.serif }]}>
              <CountUp value={team.score} duration={520} from={team.score} />
            </Text>
          </View>
        );
      })}
    </View>
  );

  return (
    <Spread rail={rail} railWidth={0.25}>
      <View style={[s.row, { paddingBottom: 6 }]}>
        <View style={s.tableCat}>
          <Label color={c.muted}>{t('play.boardTopics')}</Label>
        </View>
        {[0, 1].map((side) => (
          <View key={side} style={[s.row, s.fill, side === 1 ? { borderLeftWidth: 1, borderLeftColor: c.text } : null]}>
            {values.map((v) => (
              <Text key={v} style={[s.tableHead, TABULAR, { color: c.faint, fontFamily: f.uiMedium }]}>{v}</Text>
            ))}
          </View>
        ))}
      </View>
      <Rule strong />
      <View style={s.fill}>
        {p.columns.map((col, ci) => {
          const art = p.art(col.categoryId);
          return (
            <Enter key={col.categoryId} delay={ci * 60} dy={8} style={[s.row, { height: rowH, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong }]}>
              <View style={[s.tableCat, s.row, { gap: 10 }]}>
                {art ? <Image source={art} style={{ width: rowH * 0.7, height: rowH * 0.7 }} contentFit="contain" /> : null}
                <Text style={[s.catName, { color: c.text, fontFamily: f.serif, fontSize: Math.min(18, rowH * 0.34) }]} numberOfLines={2}>
                  {col.categoryName}
                </Text>
              </View>
              {(['left', 'right'] as const).map((side, si) => (
                <View key={side} style={[s.row, s.fill, { height: '100%' }, si === 1 ? { borderLeftWidth: 1, borderLeftColor: c.text } : null]}>
                  {col.rows.map((row) => {
                    const q = row[side];
                    const used = p.isUsed(q);
                    const lit = p.flashingId === q.id || p.lockedId === q.id;
                    return (
                      <Pressable
                        key={q.id + side}
                        accessibilityRole="button"
                        accessibilityLabel={`${col.categoryName}, ${q.pointValue} points${used ? ', played' : ''}`}
                        onPress={() => p.onTilePress(q)}
                        style={({ pressed }) => [s.tableCell, { backgroundColor: lit ? c.right : pressed ? c.surface2 : 'transparent' }]}
                      >
                        <Text
                          style={[
                            s.tableNum,
                            TABULAR,
                            {
                              color: lit ? c.onRight : used ? c.faint : c.text,
                              fontFamily: f.serif,
                              fontSize: Math.min(22, rowH * 0.42),
                              textDecorationLine: used ? 'line-through' : 'none',
                            },
                          ]}
                        >
                          {used ? '—' : q.pointValue}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </Enter>
          );
        })}
      </View>
    </Spread>
  );
}

/* -------------------------------------------------------- question/answer */

export function EditorialQuestion(p: R2QuestionProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const { width, height } = useWindowDimensions();
  const q = p.question;
  const session = p.session;
  const current = session.teams.find((team) => team.id === session.currentTeamId);
  const review = Boolean(session.reviewingUsedQuestion);
  const wagerQ = Boolean(session.wager?.question);
  const scored = session.phase === 'scoring';
  const played = session.board.filter((x) => x.id !== q.id && (session.usedQuestionIds.has(x.id) || x.used)).length;
  const pageW = width * 0.7 - 70;
  const qSize = fitFontSize(q.prompt, pageW, p.isAnswerPhase ? height * 0.2 : height * 0.5, p.isAnswerPhase ? 22 : 34, 14, 0.46, 1.22);
  const aSize = fitFontSize(q.answer, pageW * 0.55, height * 0.26, 40, 18, 0.5, 1.12);
  const teams = awardableTeams(session, q);

  const rail = (
    <View style={s.fill}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={p.onBack} style={s.backLink}>
        <Ionicons name="arrow-back" size={16} color={c.text} />
        <Text style={[s.iconLinkText, { color: c.text, fontFamily: f.uiMedium }]}>{t('play.phase.board')}</Text>
      </Pressable>
      <Text style={[s.folioNo, TABULAR, { color: c.text, fontFamily: f.serif }]}>{`No. ${String(played + 1).padStart(2, '0')}`}</Text>
      <Text style={[s.railMeta, { color: c.text, fontFamily: f.uiSemi }]}>{q.categoryName}</Text>
      <Text style={[s.railMeta, { color: c.muted, fontFamily: f.serif }]}>{`for ${q.pointValue} points`}</Text>
      {current && !review ? (
        <Text style={[s.railMeta, { color: c.muted, fontFamily: f.serif }]}>{`${current.name} to answer`}</Text>
      ) : null}
      <View style={s.fill} />
      <Label color={c.muted}>{t('play.questionTimer')}</Label>
      <Text style={[s.clock, TABULAR, { color: p.hasTimedOut ? c.wrong : c.text, fontFamily: f.serif }]}>{p.timeLabel}</Text>
      {p.guide ? <Text style={[s.footnote, { color: c.muted, fontFamily: f.serif }]}>{p.guide}</Text> : null}
    </View>
  );

  return (
    <Spread rail={rail} railWidth={0.26}>
      <Enter revealKey={q.id} dy={6} style={p.isAnswerPhase ? null : [s.fill, { justifyContent: 'center' }]}>
        <Text style={[s.dropcapLabel, { color: c.faint, fontFamily: f.uiSemi }]}>{t('play.phase.question').toUpperCase()}</Text>
        <Text testID="question-prompt" style={[s.qText, { fontSize: qSize, lineHeight: Math.round(qSize * 1.22), color: c.text, fontFamily: f.serif }]}>
          {q.prompt}
        </Text>
        {p.promptImage && !p.isAnswerPhase ? <Image source={p.promptImage} style={s.qImage} contentFit="contain" /> : null}
      </Enter>

      {!p.isAnswerPhase ? (
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Pressable accessibilityRole="button" onPress={p.onReport}>
            <Text style={[s.footnote, { color: c.faint, fontFamily: f.serif }]}>{t('play.report.button')}</Text>
          </Pressable>
          <Pressable
            testID="question-show-answer"
            accessibilityRole="button"
            accessibilityLabel={t('play.showAnswer')}
            disabled={!p.canShowAnswer}
            onPress={p.onShowAnswer}
            style={({ pressed }) => [s.inkButton, { backgroundColor: c.ink, opacity: !p.canShowAnswer ? 0.35 : pressed ? 0.85 : 1 }]}
          >
            <Text style={[s.inkButtonText, { color: c.onInk, fontFamily: f.uiSemi }]}>{t('play.showAnswer').toUpperCase()}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.fill, s.rowTop, { gap: 22, marginTop: 14 }]}>
          <Enter delay={60} dy={16} style={[s.answerBox, { backgroundColor: c.ink }]} revealKey={q.id + 'a'}>
            <Text style={[s.label, { color: c.inkMuted, fontFamily: f.uiSemi }]}>
              {(p.hasTimedOut ? t('play.timeUpTitle') : t('play.correctAnswer')).toUpperCase()}
            </Text>
            <Text testID="question-answer-box" style={[s.answerText, { color: c.onInk, fontFamily: f.serif, fontSize: aSize, lineHeight: Math.round(aSize * 1.12) }]}>
              {q.answer}
            </Text>
          </Enter>
          <Enter delay={200} dy={10} style={s.fill}>
            {review ? (
              <TextLink label={t('play.phase.board')} onPress={p.onBack} strong />
            ) : wagerQ ? (
              <>
                <Label color={c.muted}>{t('play.wagerCardTitle')}</Label>
                <Rule strong />
                <VerdictRow label="Answered correctly" tone="right" chosen={false} onPress={() => p.onResolveWager(true)} />
                <VerdictRow label="Answered wrongly" tone="wrong" chosen={false} onPress={() => p.onResolveWager(false)} />
              </>
            ) : (
              <>
                <Label color={c.muted}>{p.hasTimedOut ? t('play.noPointsAwarded') : 'Who had it?'}</Label>
                <Rule strong />
                {teams.map((team) => (
                  <VerdictRow
                    key={team.id}
                    label={team.name}
                    meta={`+${q.pointValue}`}
                    tone="right"
                    chosen={scored && session.lastAwardedTeamId === team.id}
                    disabled={p.hasTimedOut}
                    onPress={() => p.onAward(team.id)}
                  />
                ))}
                <VerdictRow
                  label="Nobody"
                  meta="0"
                  tone="wrong"
                  chosen={scored && session.lastAwardedTeamId === null}
                  disabled={p.hasTimedOut}
                  onPress={() => p.onAward(null)}
                />
                <View style={s.fill} />
                <View style={[s.row, { justifyContent: 'space-between' }]}>
                  {p.canWager ? <TextLink label={t('play.wagerNextTeam')} onPress={p.onWager} /> : <View />}
                  <TextLink label={session.bonus.active ? t('play.finishMatch') : t('play.nextTurn')} onPress={p.onNext} strong disabled={!scored} />
                </View>
              </>
            )}
          </Enter>
        </View>
      )}
    </Spread>
  );
}

function VerdictRow({
  label,
  meta,
  tone,
  chosen,
  disabled,
  onPress,
}: {
  label: string;
  meta?: string;
  tone: 'right' | 'wrong';
  chosen: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { c, f } = useR2Theme();
  const col = tone === 'right' ? c.right : c.wrong;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.verdict,
        {
          borderBottomColor: c.lineStrong,
          backgroundColor: chosen ? (tone === 'right' ? c.rightSoft : c.wrongSoft) : pressed ? c.surface2 : 'transparent',
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View style={[s.verdictMark, { borderColor: col, backgroundColor: chosen ? col : 'transparent' }]}>
        <Ionicons name={tone === 'right' ? 'checkmark' : 'close'} size={13} color={chosen ? (tone === 'right' ? c.onRight : c.onWrong) : col} />
      </View>
      <Text style={[s.verdictLabel, { color: c.text, fontFamily: chosen ? f.uiSemi : f.ui }]} numberOfLines={1}>
        {label}
      </Text>
      {meta ? <Text style={[s.verdictMeta, TABULAR, { color: chosen ? col : c.muted, fontFamily: f.serif }]}>{meta}</Text> : null}
    </Pressable>
  );
}

/* --------------------------------------------------------------- results */

export function EditorialResults(p: R2ResultsProps) {
  const { c, f } = useR2Theme();
  const { t } = useI18n();
  const { height } = useWindowDimensions();
  const ranked = rankTeams(p.session.teams);
  const tie = isTie(p.session.teams);
  const winner = ranked[0]!;
  const recap = useMemo(() => buildRecap(p.session), [p.session]);
  const byCat = useMemo(() => {
    const m = new Map<string, { name: string; items: typeof recap }>();
    for (const r of recap) {
      const e = m.get(r.question.categoryId) ?? { name: r.question.categoryName, items: [] };
      e.items.push(r);
      m.set(r.question.categoryId, e);
    }
    return Array.from(m.values());
  }, [recap]);
  const right = recap.filter((r) => r.right).length;

  const rail = (
    <View style={s.fill}>
      <Masthead />
      <View style={{ height: 18 }} />
      <Label color={c.muted}>{t('play.matchComplete')}</Label>
      <Text style={[s.railMeta, { color: c.text, fontFamily: f.serif }]}>{`${recap.length} questions played`}</Text>
      <Text style={[s.railMeta, { color: c.right, fontFamily: f.serif }]}>{`${right} answered right`}</Text>
      <Text style={[s.railMeta, { color: c.wrong, fontFamily: f.serif }]}>{`${recap.length - right} missed`}</Text>
      <View style={s.fill} />
      <TextLink label={t('play.startAnotherMatch')} onPress={p.onAnotherMatch} strong />
      <TextLink label={t('play.backToHome')} onPress={p.onHome} />
      <TextLink label={t('play.questionBoardTitle')} onPress={p.onReviewBoard} />
    </View>
  );

  return (
    <Spread rail={rail} railWidth={0.28}>
      <Enter dy={10}>
        <Label color={c.muted}>{tie ? t('play.tieGame') : t('play.winner')}</Label>
        <Text style={[s.headline, { color: c.text, fontFamily: f.serif, fontSize: Math.min(44, height * 0.11) }]} numberOfLines={2}>
          {tie ? 'A dead heat.' : `${winner.name} take the night.`}
        </Text>
      </Enter>
      <Rule strong />
      <View style={[s.fill, s.rowTop, { gap: 24, marginTop: 8 }]}>
        <Enter delay={120} style={s.fill}>
          {ranked.map((team, i) => (
            <View key={team.id} style={[s.standRow, { borderBottomColor: c.lineStrong }]}>
              <Text style={[s.rank, TABULAR, { color: c.faint, fontFamily: f.serif }]}>{i + 1}</Text>
              <Text style={[s.standName, s.fill, { color: c.text, fontFamily: i === 0 ? f.uiSemi : f.ui }]} numberOfLines={1}>
                {team.name}
              </Text>
              <Text style={[s.bigScore, TABULAR, { color: c.text, fontFamily: f.serif }]}>
                <CountUp value={team.score} duration={1000} />
              </Text>
            </View>
          ))}
        </Enter>
        <Enter delay={260} style={s.fill}>
          <Label color={c.muted}>The ledger</Label>
          <ScrollView style={s.fill}>
            {byCat.map((cat) => (
              <View key={cat.name} style={[s.ledgerLine, { borderBottomColor: c.line }]}>
                <Text style={[s.ledgerCat, { color: c.text, fontFamily: f.serif }]} numberOfLines={1}>
                  {cat.name}
                </Text>
                <View style={[s.row, { gap: 4 }]}>
                  {cat.items.map((r) => (
                    <View key={r.question.id} style={[s.ledgerDot, { backgroundColor: r.right ? c.right : c.wrong }]}>
                      <Ionicons name={r.right ? 'checkmark' : 'close'} size={9} color={r.right ? c.onRight : c.onWrong} />
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </Enter>
      </View>
    </Spread>
  );
}

/* ---------------------------------------------------------------- styles */

const s = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowTop: { flexDirection: 'row', alignItems: 'stretch' },
  center: { alignItems: 'center', justifyContent: 'center' },
  rail: { borderRightWidth: StyleSheet.hairlineWidth, paddingRight: 20 },
  label: { fontSize: 10, letterSpacing: 1.6 },
  mast: { fontSize: 34, letterSpacing: -0.8, fontStyle: 'italic' },
  mastSub: { fontSize: 13, fontStyle: 'italic', marginTop: -2 },
  railNum: { fontSize: 30, letterSpacing: -0.5 },
  railTitle: { fontSize: 26, letterSpacing: -0.5, marginBottom: 6 },
  railMeta: { fontSize: 14, lineHeight: 20 },
  iconLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  iconLinkText: { fontSize: 13 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  textLink: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  textLinkStrong: { fontSize: 16 },
  textLinkQuiet: { fontSize: 13 },
  indexRow: { flex: 1, minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 18, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4 },
  indexNo: { fontSize: 30, width: 44, letterSpacing: -1 },
  indexTitle: { fontSize: 26, letterSpacing: -0.5 },
  indexCopy: { fontSize: 12.5, marginTop: 2 },
  indexCost: { fontSize: 12 },
  sheet: { width: 440, maxWidth: '92%', padding: 26, gap: 8 },
  sheetTitle: { fontSize: 28, letterSpacing: -0.5 },
  sheetBody: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  footnote: { fontSize: 13, fontStyle: 'italic', marginTop: 6 },
  teamName: { fontSize: 30, paddingVertical: 2, letterSpacing: -0.5 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', height: 38, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  ledgerNo: { fontSize: 15, width: 22 },
  ledgerInput: { flex: 1, fontSize: 15, paddingVertical: 4 },
  standRow: { flexDirection: 'row', alignItems: 'center', minHeight: 46, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  standName: { fontSize: 14 },
  toPlay: { fontSize: 12, fontStyle: 'italic' },
  standScore: { fontSize: 24 },
  tableCat: { width: '30%', paddingRight: 8 },
  tableHead: { flex: 1, textAlign: 'center', fontSize: 11 },
  tableCell: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  tableNum: {},
  catName: { flex: 1, letterSpacing: -0.2 },
  folioNo: { fontSize: 40, letterSpacing: -1.2, marginBottom: 6 },
  clock: { fontSize: 40, letterSpacing: -1 },
  dropcapLabel: { fontSize: 10, letterSpacing: 2, marginBottom: 8 },
  qText: { letterSpacing: -0.3 },
  qImage: { width: '100%', height: 90, marginTop: 10 },
  inkButton: { height: 50, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center' },
  inkButtonText: { fontSize: 13, letterSpacing: 2 },
  answerBox: { width: '52%', padding: 20, justifyContent: 'space-between' },
  answerText: { letterSpacing: -0.4 },
  verdict: { flexDirection: 'row', alignItems: 'center', height: 42, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 6 },
  verdictMark: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  verdictLabel: { flex: 1, fontSize: 15 },
  verdictMeta: { fontSize: 16 },
  headline: { letterSpacing: -1, marginVertical: 6 },
  rank: { fontSize: 22, width: 20 },
  bigScore: { fontSize: 30, letterSpacing: -0.8 },
  ledgerLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
  ledgerCat: { fontSize: 14, flex: 1 },
  ledgerDot: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});
