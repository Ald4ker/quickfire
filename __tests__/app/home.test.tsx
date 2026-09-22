import React from 'react';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Modal, Platform, StyleSheet } from 'react-native';

import AppHubScreen from '@/app/(app)/index';
import { COLORS, FONTS } from '@/constants';
import { usePlayStore } from '@/store/play';
import { useThemeStore } from '@/store/theme';
import { __setAuthDisabled } from '../doubles/authMode';
import { __setClerkAuth } from '../doubles/clerkExpo';
import { router } from '../doubles/expoRouter';
import { __setWindowDimensions } from '../doubles/windowDimensions';

describe('AppHubScreen', () => {
  beforeEach(async () => {
    __setClerkAuth({ isLoaded: true, isSignedIn: true });
    __setAuthDisabled(false);
    __setWindowDimensions({
      width: 800,
      height: 700,
      scale: 2,
      fontScale: 1,
    });
    useThemeStore.setState({ paletteId: 'default' });
    usePlayStore.setState({ session: null, tokens: 20, rapidFire: null });
    await usePlayStore.getState().hydrate();
  });

  it('starts quick play directly from the home mode choices', async () => {
    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Quick Play'));

    await waitFor(() => {
      expect(usePlayStore.getState().session?.mode).toBe('quickPlay');
      expect(usePlayStore.getState().session?.step).toBe('quick-play-length');
      expect(router.push).toHaveBeenCalledWith('/play/quick-length');
    });
  });

  it('starts classic mode directly from the home mode choices', async () => {
    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Classic'));

    await waitFor(() => {
      expect(usePlayStore.getState().session?.mode).toBe('classic');
      expect(usePlayStore.getState().session?.step).toBe('team-setup');
      expect(router.push).toHaveBeenCalledWith('/play/team-setup');
    });
  });

  it('shows the token cost under each game mode', () => {
    render(<AppHubScreen />);

    expect(screen.getByTestId('home-mode-token-cost-quickPlay')).toHaveTextContent('2-8 TOKENS');
    expect(screen.getByTestId('home-mode-token-cost-classic')).toHaveTextContent('10 TOKENS');
    expect(screen.getByTestId('home-mode-token-cost-random')).toHaveTextContent('2-10 TOKENS');
    expect(screen.getByTestId('home-mode-token-cost-rumble')).toHaveTextContent('10 TOKENS');
  });

  it('removes raised white top borders from dark mode cards', () => {
    useThemeStore.setState({ paletteId: 'dark' });
    render(<AppHubScreen />);

    expect(
      StyleSheet.flatten(screen.getByTestId('home-mode-card-quickPlay').props.style)
    ).toMatchObject({ borderTopWidth: 0, borderTopColor: 'transparent' });
    expect(
      StyleSheet.flatten(screen.getByTestId('hub-token-chip-face').props.style)
    ).toMatchObject({ borderTopWidth: 0, borderTopColor: 'transparent' });
  });

  it('shows three people for rumble', () => {
    render(<AppHubScreen />);

    expect(screen.getByTestId('home-rumble-person-1')).toBeTruthy();
    expect(screen.getByTestId('home-rumble-person-2')).toBeTruthy();
    expect(screen.getByTestId('home-rumble-person-3')).toBeTruthy();
  });

  it('opens settings from the header gear', () => {
    render(<AppHubScreen />);

    fireEvent.press(screen.getByTestId('home-open-settings'));

    expect(router.push).toHaveBeenCalledWith('/(app)/settings');
  });

  it('shows a calm playbackfire.com outbound link on native', () => {
    render(<AppHubScreen />);

    expect(screen.getByTestId('outbound-platform-links-native')).toBeTruthy();
    expect(screen.getByTestId('outbound-website-link')).toHaveTextContent('playbackfire.com');
    expect(screen.queryByTestId('outbound-platform-links-web')).toBeNull();
  });

  it('prompts to continue or start new when a session is already in progress', () => {
    usePlayStore.getState().ensureDraft();
    const current = usePlayStore.getState().session;
    usePlayStore.setState({
      session: current
        ? {
            ...current,
            mode: 'classic',
            step: 'board',
          }
        : null,
    });

    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Quick Play'));

    expect(screen.getByText('Continue or start fresh?')).toBeTruthy();
    expect(screen.getByText('CONTINUE GAME')).toBeTruthy();
    expect(screen.getByText('NEW GAME')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('continues the current game route from the resume prompt', () => {
    usePlayStore.getState().ensureDraft();
    const current = usePlayStore.getState().session;
    usePlayStore.setState({
      session: current
        ? {
            ...current,
            mode: 'classic',
            step: 'board',
          }
        : null,
    });

    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Quick Play'));
    fireEvent.press(screen.getByLabelText('Continue Game'));

    expect(router.push).toHaveBeenCalledWith('/play/board');
    expect(usePlayStore.getState().session?.mode).toBe('classic');
  });

  it('starts a fresh game from the resume prompt with the selected mode', async () => {
    usePlayStore.getState().ensureDraft();
    const current = usePlayStore.getState().session;
    usePlayStore.setState({
      session: current
        ? {
            ...current,
            mode: 'classic',
            step: 'board',
          }
        : null,
    });

    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Quick Play'));
    fireEvent.press(screen.getByLabelText('New Game'));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/play/quick-length');
      expect(usePlayStore.getState().session?.mode).toBe('quickPlay');
      expect(usePlayStore.getState().session?.step).toBe('quick-play-length');
    });
  });

  it('keeps the home mode choices in one horizontal row', () => {
    render(<AppHubScreen />);

    expect(screen.getByTestId('home-mode-row')).toHaveStyle({
      flexDirection: 'row',
      flexWrap: 'nowrap',
    });
  });

  it('keeps header chrome and taller aspect-ratio mode cards on compact phone landscape', () => {
    __setWindowDimensions({
      width: 874,
      height: 402,
      scale: 3,
      fontScale: 1,
    });

    render(<AppHubScreen />);

    expect(screen.getByTestId('home-header-chrome')).toBeTruthy();
    expect(screen.getByLabelText('BackFire')).toBeTruthy();
    expect(screen.getByTestId('home-open-settings')).toBeTruthy();

    const rowStyle = StyleSheet.flatten(screen.getByTestId('home-mode-row').props.style);
    expect(rowStyle).toMatchObject({
      marginTop: 0,
      paddingVertical: 4,
      justifyContent: 'center',
      alignItems: 'center',
    });

    expect(StyleSheet.flatten(screen.getByTestId('home-mode-tile-quickPlay').props.style)).toMatchObject({
      aspectRatio: 0.72,
    });
  });

  it('matches Android mode description size on compact iOS landscape without clipping long blurbs', () => {
    // iPhone landscape short side is compact (< 560); Android 720-tall landscape is not.
    __setWindowDimensions({
      width: 874,
      height: 402,
      scale: 3,
      fontScale: 1,
    });

    render(<AppHubScreen />);

    for (const mode of ['quickPlay', 'classic', 'random', 'rumble'] as const) {
      const copy = screen.getByTestId(`home-mode-card-copy-${mode}`);
      expect(StyleSheet.flatten(copy.props.style)).toMatchObject({
        fontSize: 11,
        lineHeight: 15,
        minHeight: 45,
      });
      // 3 lines: room for Rumble's long EN blurb on ~155pt card width.
      expect(copy.props.numberOfLines).toBe(3);
    }
  });

  it('shows the BackFire logo image in the home header title area', () => {
    render(<AppHubScreen />);

    expect(screen.getByLabelText('BackFire')).toBeTruthy();
    expect(screen.queryByText('BackFire')).toBeNull();
  });

  it('uses a flat card face for mode choices (no gray strip bevel or hard lift)', () => {
    render(<AppHubScreen />);

    expect(screen.getByTestId('home-mode-card-quickPlay')).toHaveStyle({
      backgroundColor: '#FFFFFF',
      borderTopWidth: 0,
      borderTopColor: 'transparent',
      borderBottomWidth: 0,
      borderBottomColor: 'transparent',
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    });
    expect(screen.getByTestId('home-mode-card-title-quickPlay')).toHaveStyle({
      color: '#333333',
      fontFamily: FONTS.uiBold,
      fontSize: 16,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    });
    expect(screen.getByTestId('home-mode-card-copy-quickPlay')).toHaveStyle({
      color: 'rgba(51, 51, 51, 0.58)',
      fontFamily: FONTS.ui,
      fontSize: 11,
      letterSpacing: 0.15,
    });
    expect(screen.queryByTestId('home-backfire-mode-art')).toBeNull();
  });

  it('hides mode info icons while SHOW_HOME_MODE_INFO_UI is off', () => {
    render(<AppHubScreen />);

    expect(screen.queryByLabelText('Quick Play info')).toBeNull();
    expect(screen.queryByLabelText('Classic info')).toBeNull();
    expect(screen.queryByLabelText('Random info')).toBeNull();
    expect(screen.queryByLabelText('Rumble info')).toBeNull();
    expect(screen.queryByTestId('home-mode-info-overlay')).toBeNull();
  });

  it('dims the full viewport behind the continue-or-start-fresh modal', () => {
    usePlayStore.getState().ensureDraft();
    const current = usePlayStore.getState().session;
    usePlayStore.setState({
      session: current
        ? {
            ...current,
            mode: 'classic',
            step: 'board',
          }
        : null,
    });

    render(<AppHubScreen />);
    fireEvent.press(screen.getByLabelText('Quick Play'));

    const overlay = screen.getByTestId('home-resume-overlay');
    expect(screen.getByText('Continue or start fresh?')).toBeTruthy();

    const overlayStyle = StyleSheet.flatten(overlay.props.style);
    expect(overlayStyle.top).toBe(0);
    expect(overlayStyle.right).toBe(0);
    expect(overlayStyle.bottom).toBe(0);
    expect(overlayStyle.left).toBe(0);
    expect(overlayStyle.flex).toBe(1);
    expect(overlayStyle.width).toBe('100%');
    expect(overlayStyle.height).toBe('100%');
    expect(overlayStyle.backgroundColor).toBe(COLORS.overlay);

    if (Platform.OS === 'web') {
      expect(screen.UNSAFE_queryByType(Modal)).toBeNull();
    } else {
      expect(screen.UNSAFE_queryByType(Modal)).not.toBeNull();
    }
  });

  it('does not show public auth entry in the home header when signed out', () => {
    __setClerkAuth({ isLoaded: true, isSignedIn: false });

    render(<AppHubScreen />);

    expect(screen.queryByTestId('public-auth-entry')).toBeNull();
  });

  it('shows sign in on mode cards and routes to auth when signed out', () => {
    __setClerkAuth({ isLoaded: true, isSignedIn: false });

    render(<AppHubScreen />);

    expect(screen.getAllByText('SIGN IN')).toHaveLength(4);
    expect(screen.getByLabelText('Quick Play. SIGN IN').props.accessibilityState?.disabled).toBe(false);

    fireEvent.press(screen.getByLabelText('Quick Play. SIGN IN'));

    expect(usePlayStore.getState().session).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/(auth)/sign-in');
  });

  it('lets signed-out players start a game when auth is disabled', async () => {
    __setClerkAuth({ isLoaded: true, isSignedIn: false });
    __setAuthDisabled(true);

    render(<AppHubScreen />);

    fireEvent.press(screen.getByLabelText('Quick Play'));

    await waitFor(() => {
      expect(usePlayStore.getState().session?.mode).toBe('quickPlay');
      expect(usePlayStore.getState().session?.step).toBe('quick-play-length');
      expect(router.push).toHaveBeenCalledWith('/play/quick-length');
    });
  });
});
