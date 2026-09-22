import React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal, Platform, StyleSheet } from 'react-native';

import TeamSetupScreen from '@/app/(app)/play/team-setup';
import { COLORS } from '@/constants';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import { HOME_SOFT_UI } from '@/themes';
import { router } from '../doubles/expoRouter';
import { __setWindowDimensions } from '../doubles/windowDimensions';

describe('TeamSetupScreen random topic-count control (source)', () => {
  const source = readFileSync(join(__dirname, '../../app/(app)/play/team-setup.tsx'), 'utf8');
  const enSource = readFileSync(join(__dirname, '../../lib/i18n/messages/en.ts'), 'utf8');

  it('puts Number of Topics in the centre card with a tappable count box and 1–6 picker', () => {
    expect(source).toContain('testID="random-topic-count-card"');
    expect(source).toContain('testID="random-topic-count-box"');
    expect(source).toContain('testID="random-topic-token-cost"');
    expect(source).toContain('testID="random-topic-picker"');
    expect(source).toContain("t('play.numberOfTopics')");
    expect(source).toContain('([1, 2, 3, 4, 5, 6] as const)');
    expect(source).toContain('setTopicPickerOpen(true)');
    expect(source).toContain('getGameTokenCost');
    expect(source).toContain('topicPickerLayout');
    expect(source).toContain('sheetMaxWidth');
    expect(source).toContain('topicCountTile');
    expect(source).toContain('topicPickerOptionCostBlock');
    expect(source).toContain('topicPickerOptionTokensWord');
    expect(source).toContain('faceColor = selected ? T.textPrimary');
    expect(enSource).toContain("'play.numberOfTopics': 'Number of Topics'");
    expect(enSource).toMatch(/randomiser/i);
    expect(enSource).not.toMatch(/'[^']*Randomize[^']*'/);
  });
});

describe('TeamSetupScreen', () => {
  beforeEach(async () => {
    __setWindowDimensions({
      width: 390,
      height: 844,
      scale: 2,
      fontScale: 1,
    });
    usePlayStore.setState({ session: null, tokens: 5, rapidFire: null });
    useThemeStore.setState({ paletteId: 'default' });
    await usePlayStore.getState().hydrate();
    usePlayStore.getState().ensureDraft();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('opens wager setup help in a full-screen overlay', () => {
    render(<TeamSetupScreen />);

    expect(screen.UNSAFE_queryByType(Modal)).toBeNull();

    fireEvent.press(screen.getByText('What is Wager?'));

    if (Platform.OS !== 'web') {
      expect(screen.UNSAFE_queryByType(Modal)).not.toBeNull();
    } else {
      expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    }
    const overlay = screen.getByTestId('wager-info-overlay');
    expect(overlay).toBeTruthy();
    expect(screen.getByText('Wagers are a risky way to try and sabotage the other team!')).toBeTruthy();

    const overlayStyle = StyleSheet.flatten(overlay.props.style);
    // Full-viewport scrim (not flex-only) so web fixed shells and native Modal both dim the screen.
    expect(overlayStyle.top).toBe(0);
    expect(overlayStyle.right).toBe(0);
    expect(overlayStyle.bottom).toBe(0);
    expect(overlayStyle.left).toBe(0);
    expect(overlayStyle.backgroundColor).toBe(COLORS.overlay);

    fireEvent.press(screen.getByLabelText('Close'));
  });

  it('shows the rumble team-count selector but hides wager and hot seat controls', () => {
    usePlayStore.getState().setMode('rumble');

    render(<TeamSetupScreen />);

    expect(screen.getByText('NUMBER OF TEAMS')).toBeTruthy();
    for (const option of ['2', '3', '4', '6']) {
      expect(screen.getByText(option)).toBeTruthy();
    }
    expect(screen.getByLabelText('2 teams').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.queryByText('Hot Seat')).toBeNull();
    expect(screen.queryByText('Wager')).toBeNull();

    fireEvent.press(screen.getByLabelText('6 teams'));

    expect(usePlayStore.getState().session?.teams).toHaveLength(6);
    expect(screen.getByLabelText('6 teams').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('2 teams').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('greys rumble team counts that cannot split the selected topic count', () => {
    usePlayStore.getState().setMode('rumble');

    render(<TeamSetupScreen />);

    expect(screen.getByLabelText('Six topics').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByLabelText('Four topics'));

    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(4);
    expect(screen.getByLabelText('2 teams').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByLabelText('4 teams').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByLabelText('3 teams').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('6 teams').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.press(screen.getByLabelText('Three topics'));

    expect(usePlayStore.getState().session?.config.quickPlayTopicCount).toBe(3);
    expect(screen.getByLabelText('3 teams').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByLabelText('6 teams').props.accessibilityState).toMatchObject({ disabled: false });
    expect(screen.getByLabelText('2 teams').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByLabelText('4 teams').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('keeps the rumble names grid height stable when topic tabs snap the team count', () => {
    usePlayStore.getState().setMode('rumble');

    render(<TeamSetupScreen />);
    const gridMinHeight = () =>
      StyleSheet.flatten(screen.getByTestId('rumble-names-grid').props.style).minHeight;

    const sixTopicsHeight = gridMinHeight();
    expect(sixTopicsHeight).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Team name')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Four topics'));
    expect(gridMinHeight()).toBe(sixTopicsHeight);
    expect(screen.getAllByLabelText('Team name')).toHaveLength(2);

    fireEvent.press(screen.getByLabelText('Three topics'));
    expect(usePlayStore.getState().session?.teams).toHaveLength(3);
    expect(gridMinHeight()).toBe(sixTopicsHeight);
    expect(screen.getAllByLabelText('Team name')).toHaveLength(3);
  });

  it('shows Continue for rumble setup on wide web (floating CTA is not classic-only)', () => {
    // Classic wide-web embeds Continue in the 3-column row; rumble must still show a CTA.
    const originalOS = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    __setWindowDimensions({
      width: 1280,
      height: 800,
      scale: 1,
      fontScale: 1,
    });
    try {
      usePlayStore.getState().setMode('rumble');

      render(<TeamSetupScreen />);

      expect(screen.getByText('NUMBER OF TEAMS')).toBeTruthy();
      expect(screen.getByText('CONTINUE')).toBeTruthy();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
    }
  });

  it('updates team card color when the theme changes', () => {
    useThemeStore.setState({ paletteId: 'dark' });
    const { rerender } = render(<TeamSetupScreen />);

    expect(StyleSheet.flatten(screen.getAllByTestId('team-setup-team-card')[0].props.style).backgroundColor).toBe('#111E2E');

    act(() => {
      useThemeStore.setState({ paletteId: 'default' });
    });
    rerender(<TeamSetupScreen />);

    expect(StyleSheet.flatten(screen.getAllByTestId('team-setup-team-card')[0].props.style).backgroundColor).toBe('#FFFFFF');
  });

  it('uses distinct controls for adding and removing players', () => {
    render(<TeamSetupScreen />);

    const addControls = screen.getAllByLabelText('Add a team member');
    fireEvent.press(addControls[0]);

    const addControl = screen.getAllByLabelText('Add a team member')[0];
    const removeControl = screen.getByLabelText('Remove a team member');

    expect(addControl.props.style).not.toEqual(removeControl.props.style);
  });

  it('renders Add Player with light surface fill and dark text in light mode', () => {
    useThemeStore.setState({ paletteId: 'default' });
    render(<TeamSetupScreen />);

    const addControl = screen.getAllByLabelText('Add a team member')[0];
    const styleProp = addControl.props.style;
    const resolved =
      (styleProp instanceof Function) ? styleProp({ pressed: false }) : styleProp;
    const flat = StyleSheet.flatten(resolved);

    // Light mode: light surface control with dark label (adapts with theme).
    expect(flat.backgroundColor).toBe(HOME_SOFT_UI.colors.surface);
    expect(flat.backgroundColor).not.toBe(COLORS.text);

    const addLabel = screen.getAllByText('Add Player')[0];
    const labelFlat = StyleSheet.flatten(addLabel.props.style);
    expect(labelFlat.color).toBe(HOME_SOFT_UI.colors.textPrimary);
    expect(labelFlat.color).not.toBe('#FFFFFF');
  });

  it('renders Add Player with dark surface fill and light text in dark mode', () => {
    useThemeStore.setState({ paletteId: 'dark' });
    render(<TeamSetupScreen />);

    const addControl = screen.getAllByLabelText('Add a team member')[0];
    const styleProp = addControl.props.style;
    const resolved =
      (styleProp instanceof Function) ? styleProp({ pressed: false }) : styleProp;
    const flat = StyleSheet.flatten(resolved);

    // Dark mode: dark surface fill with light label (not always-navy).
    expect(flat.backgroundColor).toBe(HOME_SOFT_UI.colors.surface);
    expect(flat.backgroundColor).not.toBe(COLORS.text);
    expect(flat.backgroundColor).not.toBe('#FFFFFF');

    const addLabel = screen.getAllByText('Add Player')[0];
    const labelFlat = StyleSheet.flatten(addLabel.props.style);
    expect(labelFlat.color).toBe(HOME_SOFT_UI.colors.textPrimary);
    expect(labelFlat.color).not.toBe('#FFFFFF');
  });

  it('uses settings-style icon-only back control (not labeled play pill)', () => {
    render(<TeamSetupScreen />);

    const back = screen.getByLabelText('Back');
    // Labeled play pill shows visible "Back" text; settings/store are icon-only.
    expect(screen.queryByText('Back')).toBeNull();

    const styleProp = back.props.style;
    const resolved =
      (styleProp instanceof Function) ? styleProp({ pressed: false }) : styleProp;
    const flat = StyleSheet.flatten(resolved);

    expect(flat.width).toBe(44);
    expect(flat.height).toBe(44);
    expect(flat.borderRadius).toBe(14);
  });

  it('matches banner top pad on the bottom chrome edge (including Android)', () => {
    // Bottom edge uses getStandardChromeTopPadding so cream under Continue matches top chrome.
    usePlayStore.getState().setMode('rumble');
    __setWindowDimensions({
      width: 874,
      height: 402,
      scale: 3,
      fontScale: 1,
    });

    render(<TeamSetupScreen />);

    expect(screen.getByTestId('team-setup-continue-strip')).toBeTruthy();
    const scaffold = screen.getByTestId('play-scaffold');
    const flat = StyleSheet.flatten(scaffold.props.style);
    // Native: SPACING.sm + SPACING.md = 20; web uses the same helper path in this double.
    expect(flat.paddingBottom).toBeGreaterThanOrEqual(20);
  });

  it('pins classic landscape Continue to the team-card baseline instead of a lower strip', () => {
    __setWindowDimensions({
      width: 874,
      height: 402,
      scale: 3,
      fontScale: 1,
    });

    render(<TeamSetupScreen />);

    expect(screen.getByText('CONTINUE')).toBeTruthy();
    expect(screen.queryByTestId('team-setup-continue-strip')).toBeNull();
  });

  it('returns to quick-play topic length when going back during quick play', () => {
    usePlayStore.getState().setMode('quickPlay');
    usePlayStore.getState().setQuickPlayTopicCount(4);

    render(<TeamSetupScreen />);
    fireEvent.press(screen.getByLabelText('Back'));

    expect(router.replace).toHaveBeenCalledWith('/play/quick-length');
    expect(router.replace).not.toHaveBeenCalledWith('/(app)/');
    expect(router.back).not.toHaveBeenCalled();
  });

  it('returns home when going back during classic setup', () => {
    usePlayStore.getState().setMode('classic');

    render(<TeamSetupScreen />);
    fireEvent.press(screen.getByLabelText('Back'));

    expect(router.replace).toHaveBeenCalledWith('/(app)/');
    expect(router.replace).not.toHaveBeenCalledWith('/play/quick-length');
  });

  it('returns home when going back during rumble setup instead of topics', () => {
    usePlayStore.getState().setMode('rumble');

    render(<TeamSetupScreen />);
    fireEvent.press(screen.getByLabelText('Back'));

    expect(router.replace).toHaveBeenCalledWith('/(app)/');
    expect(router.replace).not.toHaveBeenCalledWith('/play/categories');
    expect(router.push).not.toHaveBeenCalledWith('/play/categories');
  });

  it('uses stack back to topic length when quick play has history', () => {
    router.canGoBack.mockReturnValue(true);
    usePlayStore.getState().setMode('quickPlay');
    usePlayStore.getState().setQuickPlayTopicCount(3);

    render(<TeamSetupScreen />);
    fireEvent.press(screen.getByLabelText('Back'));

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});
