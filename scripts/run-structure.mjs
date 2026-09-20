#!/usr/bin/env node
/**
 * Does Deepgram put artifacts either side of a short word?
 *
 * voice-lab answered "is the clip long enough and loud enough". It does not
 * answer "is the clip ONE sound". A 560ms clip for "in" is healthy by duration
 * and still plays as "in-in" if it is blip + gap + word.
 *
 * So this splits each clip the way the app does - on any silence longer than a
 * stop closure - and prints what it finds. One run means Deepgram is clean and
 * the damage is ours. Two or more means the artifact is real and keepLoudestRun
 * needs to be wired back in.
 */
import fs from 'node:fs';
import path from 'node:path';

const SAMPLE_RATE = 24000;
const SILENCE_FLOOR = 150;
const INTRA_WORD_GAP_MS = 130;

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KEY = process.env.DEEPGRAM_API_KEY;
if (!KEY) { console.error('No DEEPGRAM_API_KEY in .env or .env.local'); process.exit(1); }

const argv = process.argv.slice(2);
const mi = argv.indexOf('--model');
const MODEL = mi >= 0 ? argv[mi + 1] : 'aura-2-thalia-en';
const SPEED = 0.85;

const WORDS = argv.filter((a, i) => !a.startsWith('--') && i !== mi + 1);
const LIST = WORDS.length ? WORDS : ['I', 'i', 'it', 'in', 'on', 'at', 'my', 'for', 'she', 'get', 'drink', 'same', 'want', 'more'];

async function pcmFor(text) {
  const url = new URL('https://api.deepgram.com/v1/speak');
  url.searchParams.set('model', MODEL);
  url.searchParams.set('encoding', 'linear16');
  url.searchParams.set('sample_rate', String(SAMPLE_RATE));
  url.searchParams.set('container', 'none');
  if (MODEL.startsWith('aura-2-')) url.searchParams.set('speed', String(SPEED));

  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Audible stretches, split on any silence longer than a stop closure. */
function runs(pcm) {
  const samples = Math.floor(pcm.length / 2);
  const gap = Math.round((SAMPLE_RATE * INTRA_WORD_GAP_MS) / 1000);
  const out = [];
  let start = -1, quiet = 0, peak = 0;

  for (let i = 0; i < samples; i++) {
    const v = Math.abs(pcm.readInt16LE(i * 2));
    if (v > SILENCE_FLOOR) {
      if (start === -1) { start = i; peak = 0; }
      quiet = 0;
      if (v > peak) peak = v;
    } else if (start !== -1 && ++quiet > gap) {
      out.push({ start, end: i - quiet, peak });
      start = -1;
    }
  }
  if (start !== -1) out.push({ start, end: samples, peak });
  return out;
}

const ms = (s) => Math.round((s / SAMPLE_RATE) * 1000);
const outDir = 'scripts/voice-lab/runs';
fs.mkdirSync(outDir, { recursive: true });

console.log(`model ${MODEL}  speed ${SPEED}\n`);
console.log('word      total   runs  structure');
console.log('-'.repeat(74));

for (const w of LIST) {
  try {
    const pcm = await pcmFor(w);
    const rs = runs(pcm);
    const total = ms(pcm.length / 2);
    const structure = rs
      .map((r, i) => {
        const before = i === 0 ? `[lead ${ms(r.start)}ms] ` : `[gap ${ms(r.start - rs[i - 1].end)}ms] `;
        return `${before}${ms(r.end - r.start)}ms/peak ${r.peak}`;
      })
      .join(' ');
    const flag = rs.length > 1 ? '  <-- ARTIFACT' : '';
    console.log(`${w.padEnd(9)} ${String(total).padStart(5)}ms ${String(rs.length).padStart(4)}   ${structure}${flag}`);
    fs.writeFileSync(path.join(outDir, `${w}.pcm`), pcm);
  } catch (e) {
    console.log(`${w.padEnd(9)} FAILED  ${e.message}`);
  }
}
console.log(`\nraw pcm written to ${outDir}/`);
