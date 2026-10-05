import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LEGACY_QUESTION_KEY_VERSION } from '@/convex/seed/legacyQuestionKeys';

interface SpawnResult {
  status: number;
  stdout: string;
  stderr: string;
}

type Override = (args: Record<string, unknown>) => SpawnResult;

const SCRIPT_PATH = 'scripts/push-seed-to-convex.ts';

function functionName(cliArgs: string[]): string {
  return cliArgs.find((arg) => arg.startsWith('seed:')) ?? 'unknown';
}

function functionArgs(cliArgs: string[]): Record<string, unknown> {
  const last = cliArgs[cliArgs.length - 1] ?? '';
  return last.startsWith('{') ? (JSON.parse(last) as Record<string, unknown>) : {};
}

function ok(payload: unknown): SpawnResult {
  return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
}

function retirePayload(args: Record<string, unknown>): SpawnResult {
  return ok({
    retired: 0,
    alreadyRetired: 0,
    missingLegacy: 8912,
    missingCanonical: 0,
    inactiveCanonical: 0,
    categoryMismatch: 0,
    invalidPair: 0,
    offset: args.offset ?? 0,
    processed: 8912,
    total: 8912,
    nextOffset: null,
    mapVersion: LEGACY_QUESTION_KEY_VERSION,
    dryRun: Boolean(args.dryRun),
  });
}

function remapPayload(args: Record<string, unknown>): SpawnResult {
  return ok({
    remapped: 0,
    missingTarget: 0,
    inactiveTarget: 0,
    categoryMismatch: 0,
    unmappedLegacyKeys: 0,
    scanned: 0,
    isDone: true,
    cursor: null,
    mapVersion: LEGACY_QUESTION_KEY_VERSION,
    dryRun: Boolean(args.dryRun),
  });
}

const DEFAULT_RESPONSES: Record<string, Override> = {
  'seed:retireLegacyQuestionKeys': retirePayload,
  'seed:remapLegacyQuestionHistory': remapPayload,
  'seed:seedQuestions': () => ok({ inserted: 1, updated: 0, skipped: 0 }),
};

interface RunResult {
  calls: { name: string; cliArgs: string[]; args: Record<string, unknown> }[];
  deployCalls: string[][];
  logged: string;
  errors: string;
  thrown: unknown;
  spawnSync: SpawnMock;
  exitCode: number;
}

type SpawnMock = jest.Mock<(command: string, cliArgs: string[]) => SpawnResult>;

async function runScript(
  args: string[],
  overrides: Record<string, Override> = {}
): Promise<RunResult> {
  jest.resetModules();
  const responses = { ...DEFAULT_RESPONSES, ...overrides };
  const spawnSync = jest.fn((_command: string, cliArgs: string[]): SpawnResult => {
    if (cliArgs[0] === 'convex' && cliArgs[1] === 'deploy') {
      return { status: 0, stdout: '', stderr: '' };
    }
    const name = functionName(cliArgs);
    const override = responses[name];
    return override ? override(functionArgs(cliArgs)) : ok({});
  });
  jest.doMock('node:child_process', () => ({ spawnSync }));

  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const error = jest.spyOn(console, 'error').mockImplementation(() => {});
  const previousArgv = process.argv;
  process.argv = ['bun', SCRIPT_PATH, ...args];

  let thrown: unknown;
  try {
    // The script runs main() on import, so it must be loaded synchronously after the mocks.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/scripts/push-seed-to-convex');
  } catch (caught) {
    thrown = caught;
  }
  // Capture before restoring: mockRestore() also clears recorded calls.
  const logged = log.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
  const errors = error.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
  const allCalls = spawnSync.mock.calls.map(([, cliArgs]) => cliArgs);
  const calls = spawnSync.mock.calls
    .filter(([, cliArgs]) => cliArgs[1] === 'run')
    .map(([, cliArgs]) => ({
      name: functionName(cliArgs),
      cliArgs,
      args: functionArgs(cliArgs),
    }));
  const deployCalls = allCalls.filter((cliArgs) => cliArgs[1] === 'deploy');
  process.argv = previousArgv;
  log.mockRestore();
  error.mockRestore();

  return {
    calls,
    deployCalls,
    logged,
    errors,
    thrown,
    spawnSync,
    exitCode: typeof process.exitCode === 'number' ? process.exitCode : 0,
  };
}

function messageOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

const MIGRATION_FUNCTIONS = ['seed:retireLegacyQuestionKeys', 'seed:remapLegacyQuestionHistory'];

describe('seed:push legacy key migration', () => {
  beforeEach(() => {
    process.exitCode = 0;
  });

  afterEach(() => {
    process.exitCode = 0;
    jest.resetModules();
  });

  it('dry run reports only, with no deploy, seeding or writes', async () => {
    const result = await runScript(['--dry-run-legacy-migration']);

    expect(result.thrown).toBeUndefined();
    expect(result.calls.map((call) => call.name)).toEqual(MIGRATION_FUNCTIONS);
    for (const call of result.calls) {
      expect(call.args.dryRun).toBe(true);
    }
    expect(result.deployCalls).toEqual([]);
    expect(result.logged).toContain('reporting the legacy key migration only');
    expect(result.logged).toContain('Nothing is deployed, seeded, retired or written');
    expect(result.exitCode).toBe(0);
  });

  it('dry run fails clearly when the migration functions are not deployed', async () => {
    const result = await runScript(['--dry-run-legacy-migration'], {
      'seed:retireLegacyQuestionKeys': () => ({
        status: 1,
        stdout: '',
        stderr: 'Could not find function seed:retireLegacyQuestionKeys',
      }),
    });

    expect(messageOf(result.thrown)).toContain('is not available on development');
    expect(messageOf(result.thrown)).toContain('must already be deployed');
    expect(result.deployCalls).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it('runs the migration after the English rows on a default dev push', async () => {
    const result = await runScript(['--skip-translations']);

    expect(result.thrown).toBeUndefined();
    expect(result.calls.map((call) => call.name).slice(0, 3)).toEqual([
      'seed:seedCategories',
      'seed:seedCategoryTranslations',
      'seed:retireCategoriesNotInSeed',
    ]);
    expect(result.calls.map((call) => call.name).slice(-3)).toEqual([
      ...MIGRATION_FUNCTIONS,
      'seed:seedTokenProducts',
    ]);
    const englishSeedIndex = result.calls.findLastIndex((call) => {
      const questions = call.args.questions as { locale?: string }[] | undefined;
      return call.name === 'seed:seedQuestions' && questions?.[0]?.locale === 'en';
    });
    const firstMigrationIndex = result.calls.findIndex((call) => call.name === MIGRATION_FUNCTIONS[0]);
    expect(englishSeedIndex).toBeGreaterThanOrEqual(0);
    expect(firstMigrationIndex).toBeGreaterThan(englishSeedIndex);
    expect(result.deployCalls).toEqual([]);
    const migrationCalls = result.calls.filter((call) => MIGRATION_FUNCTIONS.includes(call.name));
    for (const call of migrationCalls) {
      expect(call.args.dryRun).toBe(false);
    }
    const seedCategories = result.calls[0]!;
    expect(seedCategories.cliArgs).toContain('--push');
    expect(result.logged).toContain('Legacy key migration complete.');
    expect(result.exitCode).toBe(0);
  });

  it('deploys code before seeding on a production push and never auto-pushes', async () => {
    const result = await runScript(['--prod', '--skip-translations']);

    expect(result.thrown).toBeUndefined();
    expect(result.deployCalls).toEqual([['convex', 'deploy', '-y']]);
    expect(result.calls.every((call) => !call.cliArgs.includes('--push'))).toBe(true);
    expect(result.calls[0]!.name).toBe('seed:seedCategories');
  });

  it('skips both migration steps with --skip-legacy-migration', async () => {
    const result = await runScript(['--skip-translations', '--skip-legacy-migration']);

    expect(result.thrown).toBeUndefined();
    expect(result.calls.map((call) => call.name)).not.toContain('seed:retireLegacyQuestionKeys');
    expect(result.calls.map((call) => call.name)).not.toContain('seed:remapLegacyQuestionHistory');
    expect(result.logged).toContain('Skipping legacy key migration');
    expect(result.exitCode).toBe(0);
  });

  it('does not seed English rows or migrate with --translations-only', async () => {
    const result = await runScript(['--translations-only']);

    expect(result.thrown).toBeUndefined();
    expect(result.calls.map((call) => call.name)).not.toContain('seed:seedCategories');
    for (const name of MIGRATION_FUNCTIONS) {
      expect(result.calls.map((call) => call.name)).not.toContain(name);
    }
    const questionCalls = result.calls.filter((call) => call.name === 'seed:seedQuestions');
    expect(questionCalls.length).toBeGreaterThan(0);
    for (const call of questionCalls) {
      const questions = call.args.questions as { locale: string }[];
      expect(questions.every((row) => row.locale !== 'en')).toBe(true);
    }
    expect(result.exitCode).toBe(0);
  });

  it('reports skips as an incomplete migration and exits non-zero', async () => {
    const result = await runScript(['--skip-translations'], {
      'seed:retireLegacyQuestionKeys': (args) => {
        const payload = JSON.parse(retirePayload(args).stdout) as Record<string, unknown>;
        payload.inactiveCanonical = 3;
        payload.missingCanonical = 1;
        return ok(payload);
      },
    });

    expect(result.thrown).toBeUndefined();
    expect(result.errors).toContain('INCOMPLETE');
    expect(result.errors).toContain('3 legacy rows kept active because the replacement row is not active');
    expect(result.errors).toContain('1 legacy rows kept active because the replacement row is missing');
    expect(result.exitCode).toBe(1);
  });

  it('reports unmapped history keys instead of claiming success', async () => {
    const result = await runScript(['--skip-translations'], {
      'seed:remapLegacyQuestionHistory': (args) => {
        const payload = JSON.parse(remapPayload(args).stdout) as Record<string, unknown>;
        payload.unmappedLegacyKeys = 2;
        return ok(payload);
      },
    });

    expect(result.errors).toContain('INCOMPLETE');
    expect(result.errors).toContain('2 history records hold position keys absent from the frozen snapshot');
    expect(result.exitCode).toBe(1);
  });

  it('prints the confirmed resume cursor when a history page fails', async () => {
    let page = 0;
    const result = await runScript(['--skip-translations'], {
      'seed:remapLegacyQuestionHistory': (args) => {
        page += 1;
        if (page === 1) {
          return ok({
            remapped: 5,
            missingTarget: 0,
            inactiveTarget: 0,
            categoryMismatch: 0,
            unmappedLegacyKeys: 0,
            scanned: 500,
            isDone: false,
            cursor: 'confirmed-cursor',
            mapVersion: LEGACY_QUESTION_KEY_VERSION,
            dryRun: Boolean(args.dryRun),
          });
        }
        return { status: 1, stdout: '', stderr: 'transient failure' };
      },
    });

    expect(messageOf(result.thrown)).toContain('transient failure');
    expect(result.errors).toContain('--legacy-history-cursor=confirmed-cursor');
    expect(
      result.calls.filter((call) => call.name === 'seed:remapLegacyQuestionHistory')
    ).toHaveLength(2);
  });

  it('resumes the history walk from --legacy-history-cursor', async () => {
    const result = await runScript(['--skip-translations', '--legacy-history-cursor=resume-from-here']);

    expect(result.thrown).toBeUndefined();
    const remapCall = result.calls.find((call) => call.name === 'seed:remapLegacyQuestionHistory');
    expect(remapCall?.args.cursor).toBe('resume-from-here');
  });

  it('refuses a frozen map version that does not match this checkout', async () => {
    const result = await runScript(['--dry-run-legacy-migration'], {
      'seed:retireLegacyQuestionKeys': (args) => {
        const payload = JSON.parse(retirePayload(args).stdout) as Record<string, unknown>;
        payload.mapVersion = 'deadbeef1234';
        return ok(payload);
      },
    });

    expect(messageOf(result.thrown)).toContain('frozen map version deadbeef1234');
    expect(messageOf(result.thrown)).toContain(LEGACY_QUESTION_KEY_VERSION);
  });

  it('refuses contradictory migration flags', async () => {
    const result = await runScript(['--dry-run-legacy-migration', '--skip-legacy-migration']);

    expect(messageOf(result.thrown)).toContain('cannot be combined');
  });
});
