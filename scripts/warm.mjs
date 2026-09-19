/**
 * Resolves every fixed-vocabulary picture up front.
 *
 * Worth running once before a demo. The first board open otherwise takes a few
 * seconds while it looks up each fixed word for the first time; afterwards it is
 * instant because the results are cached in the database.
 *
 * The dev or production server must already be running.
 *
 * Usage: node scripts/warm.mjs [http://localhost:3000]
 */

const base = process.argv[2] || process.env.WARM_BASE_URL || 'http://localhost:3000';

const started = Date.now();
process.stdout.write(`Warming the picture cache via ${base} ... `);

try {
  const res = await fetch(`${base}/api/boards`);
  if (!res.ok) {
    console.log('failed');
    console.error(`  ${base}/api/boards returned ${res.status}. Is the server running?`);
    process.exit(1);
  }
  const board = await res.json();

  const tiles = board.pages.flatMap((p) => p.tiles);
  const missing = tiles.filter((t) => !t.imageUrl).map((t) => t.term);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log('done');
  console.log(`  ${board.pages.length} folders, ${tiles.length} pictures, ${elapsed}s`);
  console.log(`  core words: ${board.core.map((c) => c.label).join(', ')} (built in, never searched)`);
  if (missing.length) {
    console.log(`  no picture found for: ${missing.join(', ')}`);
  }

  const second = Date.now();
  await fetch(`${base}/api/boards`);
  console.log(`  second open took ${Date.now() - second}ms (served from cache)`);
} catch (error) {
  console.log('failed');
  console.error(`  ${error.message}`);
  console.error('  Start the server first with: npm run dev');
  process.exit(1);
}
