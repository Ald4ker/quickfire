/** Design-preview stub for `@clerk/clerk-expo` (see metro.config.js). Always signed in. */
import type { ReactNode } from 'react';

const noop = async () => undefined;
const user = {
  id: 'user_preview',
  primaryEmailAddress: { emailAddress: 'preview@backfire.local' },
  fullName: 'Preview Player',
  firstName: 'Preview',
  lastName: 'Player',
  username: 'preview',
  imageUrl: null,
};

export function ClerkProvider({ children }: { children: ReactNode; [key: string]: unknown }) {
  return <>{children}</>;
}
export function useAuth() {
  return {
    isLoaded: true,
    isSignedIn: true,
    userId: user.id,
    sessionId: 'sess_preview',
    signOut: noop,
    getToken: async () => null,
  };
}
export function useUser() {
  return { isLoaded: true, isSignedIn: true, user };
}
export function useClerk() {
  return { signOut: noop, client: { id: 'client_preview' }, __internal_reloadInitialResources: noop };
}
const flow = async () => ({ createdSessionId: null, setActive: noop, authSessionResult: null });
export function useSSO() {
  return { startSSOFlow: flow };
}
export function useOAuth() {
  return { startOAuthFlow: flow };
}
export function useSignInWithApple() {
  return { startAppleAuthenticationFlow: flow };
}
export function useSignIn() {
  return { isLoaded: true, signIn: { create: noop, reload: noop, authenticateWithRedirect: noop }, setActive: noop };
}
export function useSignUp() {
  return { isLoaded: true, signUp: { create: noop }, setActive: noop };
}
