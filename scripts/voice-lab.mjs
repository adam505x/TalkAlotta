/**
 * Try every lever Deepgram gives us on the words that sound wrong.
 *
 * Run:  node scripts/voice-lab.mjs
 *       node scripts/voice-lab.mjs in on my get aura-2-zeus-en
 *
 * Writes a wav per variant into scripts/voice-lab/ and prints duration and peak
 * so the dead ones are obvious before you put headphones on. Costs a few hundred
 * Deepgram characters.
 */
import fs from 'node:fs';
import path from 'node:path';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const KEY = env.DEEPGRAM_API_KEY;
if (!KEY) { console.error('No DEEPGRAM_API_KEY in .env'); process.exit(1); }

const args = process.argv.slice(2);
const model = args.find((a) => a.startsWith('aura')) || env.DEEPGRAM_VOICE || 'aura-2-draco-en';
const words = args.filter((a) => !a.startsWith('aura'));
const WORDS = words.length ? words : ['i', 'in', 'on', 'at', 'for', 'my', 'get', 'she', 'no', 'it', 'same', 'drink'];

const SR = 24000;
const OUT = path.join('scripts', 'voice-lab');
fs.mkdirSync(OUT, { recursive: true });

/** Rough IPA for the awkward ones, with a length mark on the vowel. */
const IPA = {
  i: 'aɪː', in: 'ɪːn', on: 'ɒːn', at: 'æːt', for: 'fɔːr', my: 'maɪː',
  get: 'ɡɛːt', she: 'ʃiː', no: 'nəʊː', it: 'ɪːt', same: 'seɪːm', drink: 'drɪːŋk',
};

function variants(w) {
  const v = [
    ['bare', w],
    ['comma', `${w},`],
    ['period', `${w}.`],
    ['bang', `${w}!`],
    ['doubled', w.length <= 3 ? w + w.slice(-1) : w],
  ];
  if (IPA[w]) v.push(['ipa', `\\{"word": "${w}", "pronounce": "${IPA[w]}"}`]);
  return v;
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(text, speed) {
  const u = new URL('https://api.deepgram.com/v1/speak');
  u.searchParams.set('model', model);
  u.searchParams.set('encoding', 'linear16');
  u.searchParams.set('sample_rate', String(SR));
  u.searchParams.set('container', 'none');
  if (model.startsWith('aura-2-')) u.searchParams.set('speed', String(speed));
  const r = await fetch(u, {
    method: 'POST',
    headers: { Authorization: `Token ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) return { err: `HTTP ${r.status} ${(await r.text()).slice(0, 80)}` };
  const pcm = Buffer.from(await r.arrayBuffer());
  let peak = 0;
  for (let i = 0; i + 1 < pcm.length; i += 2) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i)));
  return { pcm, ms: Math.round(pcm.length / 2 / SR * 1000), peak };
}

console.log(`\n  model ${model}   speed 0.85   -> ${OUT}/\n`);
console.log(`  ${'word'.padEnd(7)}${'variant'.padEnd(9)}${'ms'.padStart(6)}${'peak'.padStart(7)}`);
console.log('  ' + '-'.repeat(46));

for (const w of WORDS) {
  for (const [name, text] of variants(w)) {
    const r = await speak(text, 0.85);
    if (r.err) { console.log(`  ${w.padEnd(7)}${name.padEnd(9)}  ${r.err}`); continue; }
    fs.writeFileSync(path.join(OUT, `${w}--${name}.wav`), wav(r.pcm));
    const flag = r.peak < 800 ? '  SILENT' : r.ms < 260 ? '  very short' : '';
    console.log(`  ${w.padEnd(7)}${name.padEnd(9)}${String(r.ms).padStart(6)}${String(r.peak).padStart(7)}${flag}`);
  }
  console.log('');
}
console.log(`  open ${OUT}  and listen. Put the winner in PRONUNCIATION in lib/tts.ts.\n`);
