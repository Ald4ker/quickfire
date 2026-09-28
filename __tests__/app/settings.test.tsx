import React from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform, StyleSheet } from 'react-native';

import SettingsScreen from '@/app/(app)/settings';
import { __setFeatureFlags } from '../doubles/featureFlags';
import { useThemeStore } from '@/store/theme';
import { useDisplayStore } from '@/store/display';
import { __setAuthDisabled } from '../doubles/authMode';
import { __setClerkAuth, __setClerkUser } from '../doubles/clerkExpo';
import { __setConvexAction } from '../doubles/convexReact';
import { router } from '../doubles/expoRouter';

const mockSignOut = jest.fn(async () => undefined);
const mockDeleteAccount = jest.fn(async () => ({ ok: true }));

describe('SettingsScreen', () => {
  beforeEach(() => {
    mockSignOut.mockClear();
    mockDeleteAccount.mockReset();
    mockDeleteAccount.mockImplementation(async () => ({ ok: true }));
    __setAuthDisabled(false);
    __setClerkAuth({ isLoaded: true, isSignedIn: true, signOut: mockSignOut });
    __setClerkUser({
      id: 'user_test_1',
      username: 'pilot',
      fullName: 'Pilot',
      firstName: 'Pilot',
      imageUrl: null,
      primaryEmailAddress: { emailAddress: 'pilot@example.com' },
    });
    __setConvexAction(async () => mockDeleteAccount());
    __setFeatureFlags({ SHOW_LANGUAGE_SETTINGS_UI: true });
    useThemeStore.setState({ paletteId: 'default' });
    useDisplayStore.setState({ playDisplayMode: 'laptop' });
  });

  afterEach(() => {
    __setFeatureFlags({ SHOW_LANGUAGE_SETTINGS_UI: false });
  });

  it('includes theme, app language, and up-to-three language settings', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Theme selection')).toBeTruthy();
    expect(screen.getByText('App Language')).toBeTruthy();
    expect(screen.getByText('Languages (up to 2)')).toBeTruthy();
    expect(screen.getByText('No trivia languages selected')).toBeTruthy();
    expect(screen.queryByText('WIN RATE')).toBeNull();
    expect(screen.queryByText('BEST STREAK')).toBeNull();
    expect(screen.queryByText('ACCURACY')).toBeNull();
  });

  it('shows legal section with links to terms and privacy', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('LEGAL')).toBeTruthy();
    expect(screen.getByText('Terms of Service')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
  });

  it('shows a calm playbackfire.com outbound link below settings content on native', () => {
    render(<SettingsScreen />);

    expect(screen.getByTestId('outbound-platform-links-native')).toBeTruthy();
    expect(screen.getByTestId('outbound-website-link')).toHaveTextContent('playbackfire.com');
  });

  it('navigates to terms and privacy pages from legal rows', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-legal-terms'));
    expect(router.push).toHaveBeenCalledWith('/terms');

    fireEvent.press(screen.getByTestId('settings-legal-privacy'));
    expect(router.push).toHaveBeenCalledWith('/privacy');
  });

  it('toggles directly between light and dark without opening a modal', () => {
    render(<SettingsScreen />);

    const toggle = screen.getByTestId('settings-theme-toggle');
    expect(screen.getByText('Light')).toBeTruthy();

    fireEvent.press(toggle);
    expect(useThemeStore.getState().paletteId).toBe('dark');
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.queryByText('Choose a color palette')).toBeNull();
    expect(
      StyleSheet.flatten(screen.getByTestId('settings-user-profile-card').props.style)
    ).toMatchObject({ borderTopWidth: 0, borderTopColor: 'transparent' });

    fireEvent.press(toggle);
    expect(useThemeStore.getState().paletteId).toBe('default');

    useThemeStore.getState().setPalette('warm');
    expect(useThemeStore.getState().paletteId).toBe('default');
  });

  it('defaults game text to laptop (neutral) and cycles laptop → phone → TV', () => {
    render(<SettingsScreen />);

    expect(screen.getByText('Laptop mode (medium)')).toBeTruthy();
    expect(screen.getByTestId('settings-display-mode-dots')).toBeTruthy();
    expect(useDisplayStore.getState().playDisplayMode).toBe('laptop');

    fireEvent.press(screen.getByTestId('settings-display-mode-toggle'));
    expect(useDisplayStore.getState().playDisplayMode).toBe('mobile');
    expect(screen.getByText('Phone mode (large)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('settings-display-mode-toggle'));
    expect(useDisplayStore.getState().playDisplayMode).toBe('tv');
    expect(screen.getByText('TV mode (small)')).toBeTruthy();

    fireEvent.press(screen.getByTestId('settings-display-mode-toggle'));
    expect(useDisplayStore.getState().playDisplayMode).toBe('laptop');
    expect(screen.getByText('Laptop mode (medium)')).toBeTruthy();
  });

  // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
  it('opens app language choices inline as a modal instead of navigating away', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText('App Language'));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText('Choose the app interface language')).toBeTruthy();
    expect(screen.getByText('Arabic')).toBeTruthy();
  });

  // SAFETY: Test fixture / double boundary cast justified by controlled test setup.
  it('opens trivia language choices inline as a modal instead of navigating away', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText('Languages (up to 2)'));

    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByText('Pick up to 2 trivia languages to show together. English is always the fallback.')).toBeTruthy();
    expect(screen.getByText('Languages')).toBeTruthy();
  });

  it('shows public sign-in entry on the settings screen when signed out', () => {
    __setClerkAuth({ isLoaded: true, isSignedIn: false, signOut: mockSignOut });
    __setClerkUser(null);

    render(<SettingsScreen />);

    expect(screen.getByTestId('public-auth-entry')).toBeTruthy();
    expect(screen.getByTestId('public-auth-entry-sign-in')).toHaveTextContent('Sign in');
    if (Platform.OS === 'web') {
      expect(screen.getByTestId('public-auth-entry-sign-up')).toHaveTextContent('CREATE ACCOUNT');
    } else {
      expect(screen.queryByTestId('public-auth-entry-sign-up')).toBeNull();
    }
  });

  it('stays usable in guest mode when auth is disabled', () => {
    __setAuthDisabled(true);
    __setClerkAuth({ isLoaded: true, isSignedIn: false, signOut: undefined });
    __setClerkUser(null);

    render(<SettingsScreen />);

    expect(screen.getByText('Theme selection')).toBeTruthy();
    expect(screen.getByText('App Language')).toBeTruthy();
    expect(screen.queryByText('Sign Out')).toBeNull();
  });

  it('shows delete account only when signed in', () => {
    const { rerender } = render(<SettingsScreen />);
    expect(screen.getByTestId('settings-delete-account-button')).toBeTruthy();

    __setClerkAuth({ isLoaded: true, isSignedIn: false, signOut: mockSignOut });
    __setClerkUser(null);
    rerender(<SettingsScreen />);
    expect(screen.queryByTestId('settings-delete-account-button')).toBeNull();
  });

  it('opens a warning on first delete-account tap without deleting yet', () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));

    expect(screen.getByTestId('settings-delete-account-modal')).toBeTruthy();
    expect(screen.getByText('Delete your account?')).toBeTruthy();
    expect(mockDeleteAccount).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('deletes only after the second confirm tap and signs the user out', async () => {
    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));
    fireEvent.press(screen.getByTestId('settings-delete-account-confirm'));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/(app)');
    });
  });

  it('keeps the modal open with a retry path when deletion fails', async () => {
    mockDeleteAccount.mockImplementationOnce(async () => {
      throw new Error('Clerk user deletion failed (500)');
    });

    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));
    fireEvent.press(screen.getByTestId('settings-delete-account-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-delete-account-error')).toHaveTextContent(
        'Clerk user deletion failed (500)'
      );
    });
    expect(screen.getByTestId('settings-delete-account-modal')).toBeTruthy();
    expect(mockSignOut).not.toHaveBeenCalled();

    mockDeleteAccount.mockImplementationOnce(async () => ({ ok: true }));
    fireEvent.press(screen.getByTestId('settings-delete-account-confirm'));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });

  it('disables confirm while deletion is in progress to prevent duplicate submits', async () => {
    let resolveDelete: ((value: { ok: true }) => void) | undefined;
    mockDeleteAccount.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDelete = resolve;
        })
    );

    render(<SettingsScreen />);

    fireEvent.press(screen.getByTestId('settings-delete-account-button'));
    fireEvent.press(screen.getByTestId('settings-delete-account-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('settings-delete-account-loading')).toBeTruthy();
    });

    // Second press while in flight should not start another request.
    fireEvent.press(screen.getByTestId('settings-delete-account-confirm'));
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveDelete?.({ ok: true });
    });

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
  });
});
