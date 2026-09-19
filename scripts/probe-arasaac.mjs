/**
 * Probe: how good is ARASAAC as the primary picture source, scored the same way
 * the app scores candidates? Run with: node scripts/probe-arasaac.mjs
 */

const WORDS = [
  'help', 'more', 'want', 'stop', 'finished', 'yes', 'no',
  'mum', 'dad', 'teacher', 'friend',
  'go', 'eat', 'drink', 'play', 'look', 'open', 'wash', 'sleep',
  'happy', 'sad', 'angry', 'tired', 'sore', 'toilet', 'hungry', 'thirsty',
  'home', 'school', 'outside', 'shop',
  'big', 'small', 'hot', 'cold', 'please',
  'dinner', 'television', 'bath', 'story', 'bed', 'teddy', 'breakfast', 'coat',
  'paint brush', 'pencils', 'sandwich', 'swings', 'park', 'teeth',
];

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function score(term, name) {
  const wanted = norm(term).split(' ').filter(Boolean);
  const got = norm(name).split(' ').filter(Boolean);
  if (!wanted.length || !got.length) return 0;
  const gotSet = new Set(got);
  const wantedSet = new Set(wanted);
  const hits = wanted.filter((t) => gotSet.has(t)).length;
  let s = hits / wanted.length;
  if (norm(name) === norm(term)) s = 1;
  else if (s === 1 && got.length > wanted.length) s -= Math.min(0.25, 0.08 * (got.length - wanted.length));
  if (hits < wanted.length) s -= 0.2 * (wanted.length - hits);
  const noise = got.filter((t) => !wantedSet.has(t)).length;
  s -= Math.min(0.15, 0.04 * noise);
  return Math.max(0, Math.min(1, s));
}

let good = 0;
let weak = 0;
let missing = 0;

for (const word of WORDS) {
  let best = null;
  try {
    const res = await fetch(
      `https://api.arasaac.org/api/pictograms/en/search/${encodeURIComponent(word)}`,
    );
    if (res.ok) {
      const hits = await res.json();
      for (const hit of Array.isArray(hits) ? hits.slice(0, 20) : []) {
        for (const kw of hit.keywords ?? []) {
          const s = score(word, kw.keyword);
          if (!best || s > best.s) best = { s, name: kw.keyword, id: hit._id ?? hit.id };
        }
      }
    }
  } catch (e) {
    /* network */
  }

  if (!best) {
    missing += 1;
    console.log(`${word.padEnd(12)} MISSING`);
  } else if (best.s >= 0.55) {
    good += 1;
    console.log(`${word.padEnd(12)} ${String(Math.round(best.s * 100)).padStart(3)}  ${best.name}  (#${best.id})`);
  } else {
    weak += 1;
    console.log(`${word.padEnd(12)} ${String(Math.round(best.s * 100)).padStart(3)}  ${best.name}  (#${best.id})   <-- weak`);
  }
}

console.log('');
console.log(`good ${good} / weak ${weak} / missing ${missing}  of ${WORDS.length}`);
