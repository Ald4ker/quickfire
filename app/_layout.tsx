import { useEffect, useMemo } from 'react';
import { AppState, Platform, StatusBar as RNStatusBar } from 'react-native';
import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar, setStatusBarHidden } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { useFonts } from 'expo-font';
import {
  NotoSansArabic_400Regular,
  NotoSansArabic_500Medium,
  NotoSansArabic_600SemiBold,
  NotoSansArabic_700Bold,
} from '@expo-google-fonts/noto-sans-arabic';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SplashHider } from '@/components/SplashHider';
import { WebLandscapeGate } from '@/components/WebLandscapeGate';
import { WebSeoHead } from '@/components/WebSeoHead';
import { Providers } from '@/lib/providers';
import { useThemeStore } from '@/store/theme';
import { mark, markOnce } from '@/lib/startupTiming';
import {
  BRAND_FONT_FACES,
  paletteUsesLightStatusBarContent,
} from '@/constants/theme';
import { ARABIC_FONTS } from '@/lib/i18n/fonts';
import { HOME_SOFT_UI } from '@/themes';
import { immersiveStatusBarScreenOptions } from '@/lib/navigation/statusBar';

mark('root layout module loaded');

SplashScreen.preventAutoHideAsync();
void SplashScreen.hideAsync();

/** Stable reference for static layout groups - avoids navigation descriptor churn each render. */
const ROOT_NESTED_STACK_SCREEN_OPTIONS = {
  headerShown: false,
  // Standalone only — Expo Go cannot use RNScreens statusBarHidden (plist flag).
  ...immersiveStatusBarScreenOptions(),
} as const;

function hideSystemStatusBar() {
  if (Platform.OS === 'web') return;
  // expo-status-bar + RN StatusBar: covers Expo Go (no VC-based bar) and standalone races.
  try {
    setStatusBarHidden(true, 'fade');
    RNStatusBar.setHidden(true, 'fade');
  } catch {
    /* Expo Go / OS may reject; immersive UI still usable */
  }
}

function lockLandscapeOrientation() {
  void import('expo-screen-orientation')
    .then((ScreenOrientation) =>
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE)
    )
    .catch(() => {
      /* web often rejects outside fullscreen; WebLandscapeGate covers UX */
    });
}

export default function RootLayout() {
  markOnce('RootLayout first render');
  const paletteId = useThemeStore((state) => state.paletteId);
  // Soft-UI canvas (cream / dark) — not palette.background white, which flashes under fade pushes.
  const backgroundColor = HOME_SOFT_UI.colors.canvas;
  const navigationTheme = useMemo(() => {
    const baseTheme = paletteId === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        background: backgroundColor,
        card: backgroundColor,
      },
    };
  }, [backgroundColor, paletteId]);
  const rootStackScreenOptions = useMemo(
    () => ({
      headerShown: false,
      animation: 'fade' as const,
      ...immersiveStatusBarScreenOptions(),
      contentStyle: {
        flex: 1,
        backgroundColor,
      },
    }),
    [backgroundColor]
  );

  useEffect(() => {
    // Run after mount so a thrown error cannot abort the whole module (empty #root on web).
    // Web: Clerk may normalize the return URL (path/query); skip strict pathname equality so the
    // popup can postMessage the opener and `openAuthSessionAsync` resolves with `success`.
    WebBrowser.maybeCompleteAuthSession(
      Platform.OS === 'web' ? { skipRedirectCheck: true } : {}
    );
  }, []);

  const [fontsLoaded] = useFonts({
    [BRAND_FONT_FACES.display]: require('../assets/fonts/ClashDisplay-Semibold.ttf'),
    [BRAND_FONT_FACES.displayBold]: require('../assets/fonts/ClashDisplay-Bold.ttf'),
    [BRAND_FONT_FACES.ui]: require('../assets/fonts/GeneralSans-Regular.ttf'),
    [BRAND_FONT_FACES.uiMedium]: require('../assets/fonts/GeneralSans-Medium.ttf'),
    [BRAND_FONT_FACES.uiSemibold]: require('../assets/fonts/GeneralSans-Semibold.ttf'),
    [BRAND_FONT_FACES.uiBold]: require('../assets/fonts/GeneralSans-Bold.ttf'),
    // Arabic / Urdu UI (Latin brand faces lack Arabic glyphs)
    [ARABIC_FONTS.ui]: NotoSansArabic_400Regular,
    [ARABIC_FONTS.uiMedium]: NotoSansArabic_500Medium,
    [ARABIC_FONTS.uiSemibold]: NotoSansArabic_600SemiBold,
    [ARABIC_FONTS.uiBold]: NotoSansArabic_700Bold,
  });

  if (fontsLoaded) markOnce('fonts loaded');

  useEffect(() => {
    // Immersive chrome (native): keep system status bar hidden so play UI gets
    // vertical space. app.json UIStatusBarHidden is standalone/dev only, not Expo Go.
    hideSystemStatusBar();
    lockLandscapeOrientation();

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        lockLandscapeOrientation();
        hideSystemStatusBar();
      }
    });

    return () => {
      appStateSub.remove();
    };
  }, []);

  return (
    <ErrorBoundary>
      <SplashHider />
      <Providers>
        <WebSeoHead />
        <StatusBar
          hidden
          style={paletteUsesLightStatusBarContent(paletteId) ? 'light' : 'dark'}
        />
        <ThemeProvider value={navigationTheme}>
          <Stack screenOptions={rootStackScreenOptions}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sso-callback" />
            <Stack.Screen name="how-to-play" />
            <Stack.Screen name="terms" />
            <Stack.Screen name="privacy" />
            <Stack.Screen name="delete-account" />
            <Stack.Screen name="login" />
            <Stack.Screen name="(auth)" options={ROOT_NESTED_STACK_SCREEN_OPTIONS} />
            <Stack.Screen name="(app)" options={ROOT_NESTED_STACK_SCREEN_OPTIONS} />
            <Stack.Screen name="(admin)" options={ROOT_NESTED_STACK_SCREEN_OPTIONS} />
            <Stack.Screen name="admin" options={ROOT_NESTED_STACK_SCREEN_OPTIONS} />
          </Stack>
        </ThemeProvider>
        <WebLandscapeGate />
      </Providers>
    </ErrorBoundary>
  );
}
