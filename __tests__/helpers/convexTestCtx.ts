/**
 * Lightweight in-memory Convex ctx fakes for unit-testing handlers.
 * Not a full Convex runtime - enough for table query/get/insert/patch flows used in tests.
 */

export type ConvexDocId = string;

/** Loose document bag for in-memory Convex table fakes used by unit tests. */
export type ConvexDoc = {
  _id: ConvexDocId;
  _creationTime?: number;
  [key: string]: unknown;
};

type EqClause = [field: string, value: unknown];
type BoundClause = { field: string; op: 'lt' | 'lte' | 'gt' | 'gte'; value: unknown };

type QueryResult = {
  unique: () => Promise<ConvexDoc | null>;
  collect: () => Promise<ConvexDoc[]>;
  order: (direction?: 'asc' | 'desc') => {
    take: (n: number) => Promise<ConvexDoc[]>;
    collect: () => Promise<ConvexDoc[]>;
  };
  take: (n: number) => Promise<ConvexDoc[]>;
};

export type TableData = Record<string, ConvexDoc[]>;

export type Identity = {
  subject: string;
  tokenIdentifier?: string;
  email?: string;
  name?: string;
} | null;

export type InsertRecord = { table: string; doc: ConvexDoc };
export type PatchRecord = { id: ConvexDocId; patch: Record<string, unknown> };

function matchesEqs(doc: ConvexDoc, eqs: EqClause[]): boolean {
  return eqs.every(([field, value]) => doc[field] === value);
}

export function createConvexTestDb(initial: TableData = {}) {
  const tables: TableData = Object.fromEntries(
    Object.entries(initial).map(([table, rows]) => [
      table,
      rows.map((row) => ({ ...row })),
    ])
  );

  const inserts: InsertRecord[] = [];
  const patches: PatchRecord[] = [];
  let idCounter = 1;

  function rowsOf(table: string): ConvexDoc[] {
    if (!tables[table]) tables[table] = [];
    return tables[table];
  }

  function matchesBounds(doc: ConvexDoc, bounds: BoundClause[]): boolean {
    return bounds.every(({ field, op, value }) => {
      const left = doc[field];
      if (typeof left !== 'number' || typeof value !== 'number') return true;
      if (op === 'lt') return left < value;
      if (op === 'lte') return left <= value;
      if (op === 'gt') return left > value;
      return left >= value;
    });
  }

  function buildQuery(table: string, eqs: EqClause[], bounds: BoundClause[] = []): QueryResult {
    const matched = (direction: 'asc' | 'desc' = 'asc') => {
      const rows = rowsOf(table).filter(
        (doc) => matchesEqs(doc, eqs) && matchesBounds(doc, bounds)
      );
      if (bounds.some((b) => b.field === 'createdAt' || b.field === 'purchasedAt')) {
        const field = bounds.find((b) => b.field === 'createdAt' || b.field === 'purchasedAt')!.field;
        rows.sort((a, b) => {
          const av = typeof a[field] === 'number' ? (a[field] as number) : 0;
          const bv = typeof b[field] === 'number' ? (b[field] as number) : 0;
          return direction === 'desc' ? bv - av : av - bv;
        });
      }
      return rows;
    };
    return {
      unique: async () => matched()[0] ?? null,
      collect: async () => matched(),
      take: async (n: number) => matched().slice(0, n),
      order: (direction: 'asc' | 'desc' = 'asc') => ({
        take: async (n: number) => matched(direction).slice(0, n),
        collect: async () => matched(direction),
      }),
    };
  }

  const db = {
    get: jest.fn(async (id: ConvexDocId) => {
      for (const rows of Object.values(tables)) {
        const found = rows.find((row) => row._id === id);
        if (found) return found;
      }
      return null;
    }),
    insert: jest.fn(async (table: string, doc: ConvexDoc) => {
      const existingId = doc._id;
      const id = existingId != null && String(existingId) === existingId ? existingId : `${table}_${idCounter++}`;
      const full: ConvexDoc = { ...doc, _id: id, _creationTime: Date.now() };
      rowsOf(table).push(full);
      inserts.push({ table, doc: full });
      return id;
    }),
    patch: jest.fn(async (id: ConvexDocId, patch: PatchRecord['patch']) => {
      patches.push({ id, patch });
      for (const rows of Object.values(tables)) {
        const idx = rows.findIndex((row) => row._id === id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], ...patch };
          return;
        }
      }
    }),
    delete: jest.fn(async (id: ConvexDocId) => {
      for (const table of Object.keys(tables)) {
        tables[table] = rowsOf(table).filter((row) => row._id !== id);
      }
    }),
    query: jest.fn((table: string) => ({
      withIndex: (
        _index: string,
        rangeFn?: (q: {
          eq: (field: string, value: unknown) => unknown;
          lt: (field: string, value: unknown) => unknown;
          lte: (field: string, value: unknown) => unknown;
          gt: (field: string, value: unknown) => unknown;
          gte: (field: string, value: unknown) => unknown;
        }) => void
      ) => {
        const eqs: EqClause[] = [];
        const bounds: BoundClause[] = [];
        const q = {
          eq(field: string, value: unknown) {
            eqs.push([field, value]);
            return q;
          },
          lt(field: string, value: unknown) {
            bounds.push({ field, op: 'lt', value });
            return q;
          },
          lte(field: string, value: unknown) {
            bounds.push({ field, op: 'lte', value });
            return q;
          },
          gt(field: string, value: unknown) {
            bounds.push({ field, op: 'gt', value });
            return q;
          },
          gte(field: string, value: unknown) {
            bounds.push({ field, op: 'gte', value });
            return q;
          },
        };
        rangeFn?.(q);
        return buildQuery(table, eqs, bounds);
      },
      filter: () => buildQuery(table, []),
      collect: async () => rowsOf(table),
      // Bounded-walk fake for handlers that use Convex's opaque pagination. The cursor is
      // the offset into the table; `continueCursor` is "" once the walk is done, matching
      // Convex's PaginationResult shape.
      paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
        const rows = rowsOf(table);
        const start = cursor ? Number(cursor) : 0;
        const page = rows.slice(start, start + numItems);
        const next = start + page.length;
        const isDone = next >= rows.length;
        return { page, isDone, continueCursor: isDone ? '' : String(next) };
      },
      order: () => ({
        take: async (n: number) => rowsOf(table).slice(0, n),
        collect: async () => rowsOf(table),
      }),
      take: async (n: number) => rowsOf(table).slice(0, n),
    })),
  };

  return { db, tables, inserts, patches };
}

export function createConvexTestCtx(args?: {
  tables?: TableData;
  identity?: Identity;
}) {
  const store = createConvexTestDb(args?.tables ?? {});
  let identity: Identity = args?.identity ?? null;

  const auth = {
    getUserIdentity: jest.fn(async () => identity),
  };

  return {
    ...store,
    auth,
    setIdentity(next: Identity) {
      identity = next;
    },
  };
}

export function userDoc(args: {
  id?: string;
  clerkId?: string;
  email?: string;
  role?: string;
  canonicalPurchaserAccountId?: string;
  name?: string;
}): ConvexDoc {
  return {
    _id: args.id ?? 'users_1',
    clerkId: args.clerkId ?? 'clerk_1',
    email: args.email,
    name: args.name,
    role: args.role,
    canonicalPurchaserAccountId: args.canonicalPurchaserAccountId,
    lastActiveAt: Date.now(),
  };
}

export function purchaserAccountDoc(args: {
  appUserId?: string;
  linkedUserId?: string;
  kind?: string;
  state?: string;
}): ConvexDoc {
  const now = Date.now();
  return {
    _id: `purchaser_${args.appUserId ?? 'purchaser_1'}`,
    appUserId: args.appUserId ?? 'purchaser_1',
    kind: args.kind ?? 'identified',
    linkedUserId: args.linkedUserId,
    state: args.state ?? 'active',
    createdAt: now,
    linkedAt: now,
    lastSeenAt: now,
    lastPlatform: 'unknown',
    lastAppVersion: 'unknown',
  };
}

export function walletDoc(args: {
  id?: string;
  purchaserAccountId?: string;
  userId?: string;
  balance?: number;
}): ConvexDoc {
  return {
    _id: args.id ?? 'wallet_1',
    purchaserAccountId: args.purchaserAccountId ?? 'purchaser_1',
    userId: args.userId,
    balance: args.balance ?? 0,
  };
}
