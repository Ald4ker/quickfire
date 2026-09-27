/** Design-preview stub for `convex/react`: no network, fixture answers for the hub. */
import type { ReactNode } from 'react';
import { getFunctionName } from 'convex/server';

const FIXTURES: Record<string, unknown> = {
  'wallet:getBalance': { balance: 24, purchaserAccountId: null },
  'users:getCurrentProfile': { _id: 'users_preview', clerkId: 'user_preview', name: 'Preview Player' },
};

function nameOf(ref: unknown): string {
  try {
    return getFunctionName(ref as never);
  } catch {
    return '';
  }
}

export class ConvexReactClient {
  readonly url?: string;
  setAuth() {}
  clearAuth() {}
  close() {}
}
export function ConvexProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function useQuery(ref: unknown, args?: unknown) {
  if (args === 'skip') return undefined;
  const name = nameOf(ref);
  return name in FIXTURES ? FIXTURES[name] : null;
}
/** Wallet-style mutations resolve as successful so the play flow can proceed. */
export function useMutation(_ref: unknown) {
  return async () => ({ ok: true, reservationId: 'res_preview', balance: 24 });
}
export function useAction(_ref: unknown) {
  return async () => null;
}
export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true };
}
export function useConvex() {
  return new ConvexReactClient();
}
