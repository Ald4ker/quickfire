// Learn more: https://docs.expo.dev/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Design preview (web only, opt-in): `EXPO_PUBLIC_DESIGN_PREVIEW=1` swaps Clerk and
 * Convex for local stubs so UI can be rendered and screenshotted without auth or a
 * backend. Never set this for a real build; unset, this file is the Expo default.
 */
if (process.env.EXPO_PUBLIC_DESIGN_PREVIEW === '1') {
  const stubs = path.join(__dirname, 'tools', 'design-preview', 'stubs');
  const aliases = {
    '@clerk/clerk-expo': path.join(stubs, 'clerkExpo.tsx'),
    '@clerk/clerk-expo/token-cache': path.join(stubs, 'clerkTokenCache.ts'),
    '@clerk/clerk-react': path.join(stubs, 'clerkReact.tsx'),
    'convex/react': path.join(stubs, 'convexReact.tsx'),
    'convex/react-clerk': path.join(stubs, 'convexReactClerk.tsx'),
  };
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const target = aliases[moduleName];
    if (target) return { type: 'sourceFile', filePath: target };
    return upstream
      ? upstream(context, moduleName, platform)
      : context.resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
