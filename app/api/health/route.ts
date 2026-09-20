import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What the RUNNING process can actually see.
 *
 * Exists because "it works locally" and "it works on the deployment" fail in
 * different ways, and the board cannot tell them apart: a missing key and a
 * stale container both come out as the same generic words. This answers three
 * questions that otherwise need a shell on the box —
 *
 *   1. which commit is actually serving (not which commit was pushed),
 *   2. which secrets the process can see (not which were typed into a
 *      dashboard, which may be a different service or environment),
 *   3. whether the SQLite directory is writable, since the filesystem is the
 *      one thing a container has and a platform can take away.
 *
 * NEVER returns a secret's value. Only whether it is there, how long it is, and
 * whether it carries the punctuation that a copy-paste tends to bring with it —
 * enough to spot the usual mistakes without printing the key to anyone who
 * finds this URL.
 */

/** The names worth reporting on, and what stops working without each. */
const WATCHED: { name: string; needed: string }[] = [
  { name: 'ANTHROPIC_API_KEY', needed: 'situation and folder word generation' },
  { name: 'DEEPGRAM_API_KEY', needed: 'speech; falls back to the browser voice' },
  { name: 'OPENSYMBOLS_SECRET', needed: 'pictures; throws rather than falling back' },
  { name: 'ANTHROPIC_MODEL', needed: 'optional, defaults to claude-haiku-4-5' },
  { name: 'DEEPGRAM_VOICE', needed: 'optional, default voice' },
  { name: 'SYMBOL_SEARCH', needed: 'optional, picture ranking mode' },
  { name: 'ELASTIC_NODE', needed: 'only when SYMBOL_SEARCH=elastic' },
  { name: 'ELASTIC_API_KEY', needed: 'only when SYMBOL_SEARCH=elastic' },
  { name: 'DATABASE_FILE', needed: 'optional, defaults to aac.db' },
];

function describe(raw: string | undefined) {
  if (raw === undefined) return { set: false };
  // An empty string is falsy, so the app treats it as absent. Said plainly,
  // because a variable that exists but is blank reads as "I set that one".
  if (raw === '') return { set: false, note: 'present but empty, which counts as unset' };

  const trimmed = raw.trim();
  return {
    set: true,
    chars: raw.length,
    // The two things a dashboard paste gets wrong, and neither is visible in
    // the dashboard afterwards.
    padded: trimmed !== raw || undefined,
    quoted: /^["'].*["']$/.test(trimmed) || undefined,
  };
}

export function GET() {
  const dir = path.join(process.cwd(), 'data');
  let database: Record<string, unknown>;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    const file = (process.env.DATABASE_FILE || 'aac.db').replace(/[^A-Za-z0-9._-]/g, '');
    const full = path.join(dir, file);
    database = {
      dir,
      writable: true,
      exists: fs.existsSync(full),
      bytes: fs.existsSync(full) ? fs.statSync(full).size : 0,
      // Saved boards, the audio cache and the history all live in this file. A
      // container without a mounted volume loses them on every redeploy.
      note: 'needs a persistent volume mounted here, or it resets on redeploy',
    };
  } catch (error) {
    database = { dir, writable: false, error: error instanceof Error ? error.message : 'unknown' };
  }

  return NextResponse.json({
    now: new Date().toISOString(),
    node: process.version,
    nodeEnv: process.env.NODE_ENV ?? null,
    // Railway injects these. Null locally, which is itself the answer to
    // "am I looking at the deployment or at my laptop?".
    deployment: {
      commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.RAILWAY_GIT_BRANCH ?? null,
      service: process.env.RAILWAY_SERVICE_NAME ?? null,
      environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    },
    env: Object.fromEntries(
      WATCHED.map(({ name, needed }) => [name, { ...describe(process.env[name]), needed }]),
    ),
    database,
  });
}
