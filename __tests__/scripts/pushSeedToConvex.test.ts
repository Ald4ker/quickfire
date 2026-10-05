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

const DEV_TARGET = 'development (successful-wildcat-165)';

function checkpointToken(
  overrides: Partial<{
    version: number;
    target: string;
    mapVersion: string;
    mode: string;
    cursor: string;
  }> = {}
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      target: DEV_TARGET,
      mapVersion: LEGACY_QUESTION_KEY_VERSION,
      mode: 'write',
      cursor: 'confirmed-1',
      ...overrides,
    }),
    'utf8'
  ).toString('base64url');
}

function emittedInstruction(errors: string): string {
  const match = /bun run seed:push [^\n]*/.exec(errors);
  if (!match) throw new Error(`no resume instruction in: ${errors}`);
  return match[0];
}

function emittedToken(errors: string): string {
  const match = /--legacy-checkpoint='([A-Za-z0-9_-]+)'/.exec(errors);
  if (!match) throw new Error(`no checkpoint token in: ${errors}`);
  return match[1]!;
}

function emittedCheckpoint(errors: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(emittedToken(errors), 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
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

function remapPagePayload(
  args: Record<string, unknown>,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    remapped: 0,
    missingTarget: 0,
    inactiveTarget: 0,
    categoryMismatch: 0,
    unmappedLegacyKeys: 0,
    scanned: 500,
    isDone: true,
    cursor: null,
    mapVersion: LEGACY_QUESTION_KEY_VERSION,
    dryRun: Boolean(args.dryRun),
    ...overrides,
  };
}

function remapPayload(args: Record<string, unknown>): SpawnResult {
  return ok(remapPagePayload(args));
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
    expect(messageOf(result.thrown)).toContain('deploy code only');
    expect(messageOf(result.thrown)).toContain('npx convex dev --once');
    // The underlying failure is preserved verbatim, not paraphrased.
    expect(messageOf(result.thrown)).toContain('Could not find function seed:retireLegacyQuestionKeys');
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

  it('prints a dry-run preserving checkpoint when a history page fails', async () => {
    let page = 0;
    const result = await runScript(['--dry-run-legacy-migration'], {
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
    expect(
      result.calls.filter((call) => call.name === 'seed:remapLegacyQuestionHistory')
    ).toHaveLength(2);

    const emitted = emittedCheckpoint(result.errors);
    expect(emittedInstruction(result.errors)).toContain('--dry-run-legacy-migration');
    expect(emitted).toMatchObject({
      mode: 'dry-run',
      target: DEV_TARGET,
      mapVersion: LEGACY_QUESTION_KEY_VERSION,
      cursor: 'confirmed-cursor',
    });

    // Following the emitted instruction is still reporting only, and keeps the confirmed
    // position instead of restarting the walk.
    const retry = await runScript([
      '--dry-run-legacy-migration',
      `--legacy-checkpoint=${emittedToken(result.errors)}`,
    ]);
    expect(retry.deployCalls).toEqual([]);
    expect(retry.calls.map((call) => call.name)).toEqual(MIGRATION_FUNCTIONS);
    expect(retry.calls.every((call) => call.args.dryRun === true)).toBe(true);
    const retryRemap = retry.calls.find(
      (call) => call.name === 'seed:remapLegacyQuestionHistory'
    );
    expect(retryRemap?.args.cursor).toBe('confirmed-cursor');
  });

  it('keeps the checkpointed position when the first resumed page fails', async () => {
    const result = await runScript(
      ['--skip-translations', `--legacy-checkpoint=${checkpointToken({ cursor: 'from-checkpoint' })}`],
      {
        'seed:remapLegacyQuestionHistory': () => ({
          status: 1,
          stdout: '',
          stderr: 'still failing',
        }),
      }
    );

    expect(messageOf(result.thrown)).toContain('still failing');
    expect(result.deployCalls).toEqual([]);
    expect(emittedCheckpoint(result.errors)).toMatchObject({
      mode: 'write',
      cursor: 'from-checkpoint',
    });
  });

  it('restarts explicitly when no page was confirmed', async () => {
    const result = await runScript(['--skip-translations'], {
      'seed:remapLegacyQuestionHistory': () => ({
        status: 1,
        stdout: '',
        stderr: 'failed on page one',
      }),
    });

    expect(result.errors).toContain('restart the walk by omitting --legacy-checkpoint');
    expect(result.errors).not.toContain('--legacy-checkpoint=');
  });

  it('resumes the history walk from a checkpoint token', async () => {
    const result = await runScript([
      '--skip-translations',
      `--legacy-checkpoint=${checkpointToken({ cursor: 'resume-from-here' })}`,
    ]);

    expect(result.thrown).toBeUndefined();
    const remapCall = result.calls.find((call) => call.name === 'seed:remapLegacyQuestionHistory');
    expect(remapCall?.args.cursor).toBe('resume-from-here');
  });

  it('sends the expected frozen map version on every migration call', async () => {
    const result = await runScript(['--skip-translations']);

    expect(result.thrown).toBeUndefined();
    const migrationCalls = result.calls.filter((call) => MIGRATION_FUNCTIONS.includes(call.name));
    expect(migrationCalls.length).toBeGreaterThan(0);
    for (const call of migrationCalls) {
      expect(call.args.expectedMapVersion).toBe(LEGACY_QUESTION_KEY_VERSION);
    }
  });

  it('sends the expected frozen map version on dry runs too', async () => {
    const result = await runScript(['--dry-run-legacy-migration']);

    expect(result.calls.map((call) => call.name)).toEqual(MIGRATION_FUNCTIONS);
    for (const call of result.calls) {
      expect(call.args.expectedMapVersion).toBe(LEGACY_QUESTION_KEY_VERSION);
      expect(call.args.dryRun).toBe(true);
    }
  });

  it('refuses a checkpoint from another target before running anything', async () => {
    const result = await runScript([
      `--legacy-checkpoint=${checkpointToken({ target: 'production (energized-hummingbird-439)' })}`,
    ]);

    expect(messageOf(result.thrown)).toContain('does not belong to this run');
    expect(messageOf(result.thrown)).toContain('target: checkpoint production');
    expect(result.spawnSync).not.toHaveBeenCalled();
  });

  it('refuses a checkpoint from another frozen snapshot', async () => {
    const result = await runScript([
      `--legacy-checkpoint=${checkpointToken({ mapVersion: 'deadbeef1234' })}`,
    ]);

    expect(messageOf(result.thrown)).toContain('frozen map version: checkpoint deadbeef1234');
    expect(result.spawnSync).not.toHaveBeenCalled();
  });

  it('refuses a checkpoint from the other mode', async () => {
    const asDryRun = await runScript([
      '--dry-run-legacy-migration',
      `--legacy-checkpoint=${checkpointToken({ mode: 'write' })}`,
    ]);
    expect(messageOf(asDryRun.thrown)).toContain('mode: checkpoint write, this run dry-run');

    const asWrite = await runScript([
      `--legacy-checkpoint=${checkpointToken({ mode: 'dry-run' })}`,
    ]);
    expect(messageOf(asWrite.thrown)).toContain('mode: checkpoint dry-run, this run write');
    expect(asWrite.spawnSync).not.toHaveBeenCalled();
  });

  it('refuses a malformed or unusable checkpoint', async () => {
    const malformed = await runScript(['--legacy-checkpoint=not base64!']);
    expect(messageOf(malformed.thrown)).toContain('is not base64url encoded');

    const undecodable = await runScript(['--legacy-checkpoint=bm90anNvbg']);
    expect(messageOf(undecodable.thrown)).toContain('could not be decoded');

    const emptyCursor = await runScript([
      `--legacy-checkpoint=${checkpointToken({ cursor: '' })}`,
    ]);
    expect(messageOf(emptyCursor.thrown)).toContain('unusable cursor');
    expect(messageOf(emptyCursor.thrown)).toContain('restart the walk');

    const oversized = await runScript([`--legacy-checkpoint=${'a'.repeat(64 * 1024)}`]);
    expect(messageOf(oversized.thrown)).toContain('checkpoint budget');
    expect(malformed.spawnSync).not.toHaveBeenCalled();
  });

  it('refuses a checkpoint combined with --skip-legacy-migration', async () => {
    const result = await runScript([
      '--skip-legacy-migration',
      `--legacy-checkpoint=${checkpointToken()}`,
    ]);

    expect(messageOf(result.thrown)).toContain('cannot be combined with --skip-legacy-migration');
  });

  it('round-trips a long opaque cursor through the emitted checkpoint', async () => {
    const longCursor = 'x'.repeat(2048);
    let page = 0;
    const result = await runScript(['--dry-run-legacy-migration'], {
      'seed:remapLegacyQuestionHistory': (args) => {
        page += 1;
        if (page === 1) {
          return ok(remapPagePayload(args, { isDone: false, cursor: longCursor }));
        }
        return { status: 1, stdout: '', stderr: 'transient failure' };
      },
    });

    expect(messageOf(result.thrown)).toContain('transient failure');
    const token = emittedToken(result.errors);
    expect(emittedCheckpoint(result.errors)).toMatchObject({
      mode: 'dry-run',
      cursor: longCursor,
    });

    // Following the emitted instruction works with this script's own decoder.
    const retry = await runScript(['--dry-run-legacy-migration', `--legacy-checkpoint=${token}`]);
    expect(retry.thrown).toBeUndefined();
    expect(retry.deployCalls).toEqual([]);
    expect(retry.calls.map((call) => call.name)).toEqual(MIGRATION_FUNCTIONS);
    expect(retry.calls.every((call) => call.args.dryRun === true)).toBe(true);
    expect(
      retry.calls.find((call) => call.name === 'seed:remapLegacyQuestionHistory')?.args.cursor
    ).toBe(longCursor);
  });

  it('round-trips unicode and JSON-escaped cursor characters', async () => {
    const trickyCursor = 'cur-"\\\n\t\u00e9\u4e2d\ud83d\ude00-' + 'y'.repeat(32);
    let page = 0;
    const result = await runScript(['--skip-translations'], {
      'seed:remapLegacyQuestionHistory': (args) => {
        page += 1;
        if (page === 1) {
          return ok(remapPagePayload(args, { isDone: false, cursor: trickyCursor }));
        }
        return { status: 1, stdout: '', stderr: 'transient failure' };
      },
    });

    const token = emittedToken(result.errors);
    expect(emittedCheckpoint(result.errors)).toMatchObject({ mode: 'write', cursor: trickyCursor });

    const retry = await runScript(['--skip-translations', `--legacy-checkpoint=${token}`]);
    expect(retry.thrown).toBeUndefined();
    expect(
      retry.calls.find((call) => call.name === 'seed:remapLegacyQuestionHistory')?.args.cursor
    ).toBe(trickyCursor);
  });

  it('never emits a token when the cursor exceeds the checkpoint budget', async () => {
    const oversizedCursor = 'x'.repeat(64 * 1024);
    let page = 0;
    const result = await runScript(['--dry-run-legacy-migration'], {
      'seed:remapLegacyQuestionHistory': (args) => {
        page += 1;
        if (page === 1) {
          return ok(remapPagePayload(args, { isDone: false, cursor: oversizedCursor }));
        }
        return { status: 1, stdout: '', stderr: 'transient failure' };
      },
    });

    expect(messageOf(result.thrown)).toContain('transient failure');
    expect(result.errors).toContain('resumable checkpoint budget');
    expect(result.errors).toContain('Restart the walk by omitting --legacy-checkpoint');
    expect(result.errors).not.toMatch(/--legacy-checkpoint='/);
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
