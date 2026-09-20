import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { contextKey, type MomentContext } from './context';
import { resolveWord } from './board';
import { CONFIDENCE_THRESHOLD } from './symbol-search';
import type { WordRole } from './core-words';

/**
 * Works out what the communicator might want to SAY BACK to something that was
 * just said to them.
 *
 * This is the other half of the board. Everything else here answers "what might
 * they want to talk about", from place and time and weather. None of that helps
 * with the thing that actually stalls a conversation: someone asks a question,
 * and the reply is sitting four folders deep. The partner waits, guesses, and
 * usually answers for them. That is the failure this is aimed at.
 *
 * WHY THE SLOTS ARE FIXED: the replies are generated, but their POSITIONS are
 * not. Slot 1 is always the accepting answer, slot 3 always the refusing one,
 * slot 2 always a question back. Generated content that moves around destroys
 * motor planning - the whole reason a communicator gets fast is that their hand
 * knows where "yes" lives before their eyes find it. So the words change and the
 * geometry does not.
 *
 * WHY THERE IS ALWAYS A NO: a system that suggests replies is putting words in
 * someone's mouth, and the one word it must never make hard to reach is the
 * refusal. "no" is generated into a guaranteed slot on every single turn, and if
 * the model fails to produce one, a plain "no" is substituted. Nobody should
 * have to accept an invitation because declining it took four taps.
 *
 * ACCEPT AND REFUSE ARE ON OPPOSITE SIDES, for the same reason they are on the
 * main board: a mis-tap between adjacent buttons must not turn a no into a yes.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

/** Specific replies, beyond the three that are always there. */
export const OPTION_COUNT = 3;

export interface Replies {
  /** Agreeing. Always slot 1. */
  accept: string;
  /** A question back, so the communicator can hold the floor. Always slot 2. */
  ask: string;
  /** Declining. Always slot 3, on the far side from accept. */
  refuse: string;
  /** Replies specific to what was actually said. */
  options: string[];
}

const SYSTEM_PROMPT = `Someone has just spoken to a person who talks using a picture communication board. Your job is to put the replies they might want on their board, so they can answer in one tap instead of spelling it out while the other person waits.

You are given what was said to them, and sometimes where they are and what they are doing.

Return:
- accept: the agreeing answer, in their voice
- ask: a question they might ask back, so the conversation stays theirs
- refuse: the declining answer, in their voice
- options: exactly ${OPTION_COUNT} other replies that fit what was actually said

Rules:
- First person, as the communicator would say it out loud. "yes please", not "the user agrees".
- Short. Two to five words. These are spoken aloud by a synthetic voice and read off a button by someone who may be scanning.
- Plain, ordinary speech. No formal or stilted phrasing, no exclamation marks.
- The options must be specific to what was said. If they were asked which drink they want, the options are drinks. If they were told something rather than asked, the options are reactions to it.
- accept and refuse must be genuinely opposite, and refuse must be a real refusal, never a softened one like "maybe later" unless there is nothing to refuse.
- If nothing was really asked, still give a usable accept and refuse, such as "that's good" and "I don't like that".
- Do not repeat a reply between fields.
- Lowercase except for names. No trailing full stop.
- Use British and Irish spelling and vocabulary: chips not fries, jumper not sweater, mum not mom.`;

const SCHEMA = {
  type: 'object',
  properties: {
    accept: { type: 'string' },
    ask: { type: 'string' },
    refuse: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
  },
  required: ['accept', 'ask', 'refuse', 'options'],
  additionalProperties: false,
} as const;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function isReplyGeneratorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function tidy(raw: unknown, fallback: string): string {
  const text = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '')
    .slice(0, 40);
  return text || fallback;
}

/**
 * Used when there is no API key, and as the floor under a model that returns
 * something unusable. Deliberately bland: a generic reply the communicator can
 * see is generic beats a specific one that is wrong about what was said.
 */
function fallbackReplies(): Replies {
  return {
    accept: 'yes please',
    ask: 'what do you mean',
    refuse: 'no thank you',
    options: ['I don’t know', 'wait a minute', 'ask mum'],
  };
}

/**
 * A conversation does not repeat the way a place does, so this is a short
 * in-process cache rather than a table: it exists to swallow the double-fire
 * when a turn gets transcribed twice, not to save money across sessions. Kept
 * small and dropped on restart, which is why there is no migration for it.
 */
const CACHE_LIMIT = 40;
const cache = new Map<string, Replies>();

function remember(key: string, replies: Replies): void {
  cache.set(key, replies);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

/**
 * Pictures for the replies, keyed by the reply text.
 *
 * Keyed by text rather than by slot so the client looks a button's picture up the
 * same way the board looks up its tiles, and a missing key simply means no
 * picture — the text alone still works.
 */
export type ReplyIcons = Record<string, string>;

/**
 * Words no picture should be chosen from. Function words and politeness carry no
 * image, and searching them returns something confidently wrong: "for" matches a
 * pictogram of the number four.
 *
 * "yes" and "no" are deliberately NOT in here. When a reply actually says "no
 * thanks", the no pictogram is what that reply means, and showing it is reading
 * the words rather than decorating the slot.
 */
const NOT_PICTURABLE = new Set([
  'i', 'me', 'my', 'you', 'your', 'it', 'its', 'that', 'this', 'they', 'them',
  'he', 'him', 'his', 'she', 'her', 'we', 'us', 'our',
  'a', 'an', 'the', 'some', 'any', 'one',
  'is', 'am', 'are', 'was', 'be', 'do', 'does', 'did', 'have', 'has', 'had',
  'can', 'could', 'would', 'will', 'shall', 'should', 'may', 'might',
  'to', 'of', 'for', 'in', 'on', 'at', 'with', 'and', 'or', 'but', 'so',
  'not', 'dont', "don't",
  'please', 'thanks', 'thank', 'ok', 'okay', 'just', 'very', 'really', 'bit',
]);

/**
 * The picture for one generated reply.
 *
 * The whole phrase is searched first, because the library often has the exact
 * thing — "orange juice" is a pictogram, and taking it beats picking one of its
 * two words. Only if that misses are the individual content words tried.
 *
 * Nothing below CONFIDENCE_THRESHOLD is used. That is the bar the rest of the app
 * uses to decide a match is too weak to accept without a caregiver confirming it,
 * and nobody confirms these: they appear mid-conversation and get pressed. A
 * button carrying the right words and no picture is honest; one carrying a
 * confidently wrong picture invites a mis-tap.
 */
/** CONFIDENCE_THRESHOLD as resolveWord reports it: 0-100 rather than 0-1. */
const MIN_CONFIDENCE = Math.round(CONFIDENCE_THRESHOLD * 100);

/**
 * Looks a term up through the board's resolver, which writes what it finds to
 * word_symbols. Going through it rather than straight to the matcher is what
 * stops every turn re-searching the library over the network: the second time
 * anyone says "milk please" the picture is already in the database.
 */
async function pictureFor(
  term: string,
  role: WordRole,
): Promise<{ url: string; confidence: number } | null> {
  const tile = await resolveWord(term, role);
  if (!tile?.imageUrl) return null;
  return { url: tile.imageUrl, confidence: tile.confidence ?? 0 };
}

/**
 * Words that make a reply a refusal.
 *
 * These are checked before anything else, because illustrating a refusal with the
 * thing being refused inverts it: "I don't want to go" drawn as the go pictogram
 * reads as agreeing to go, to anyone using the pictures rather than the text.
 * Getting negation wrong is the worst failure available here, so a negative reply
 * is always shown as a negative.
 */
const NEGATIONS = new Set(['no', 'not', "don't", 'dont', 'never', 'nothing', 'neither']);

export async function iconForPhrase(phrase: string): Promise<string | null> {
  const tokens = phrase
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, ''))
    .filter(Boolean);

  if (tokens.some((t) => NEGATIONS.has(t))) {
    return (await pictureFor('no', 'affirm'))?.url ?? null;
  }

  const whole = await pictureFor(phrase, 'noun');
  if (whole && whole.confidence >= MIN_CONFIDENCE) return whole.url;

  const words = tokens.filter((w) => w.length > 1 && !NOT_PICTURABLE.has(w));

  // On equal confidence the later word wins. English puts the informative noun
  // near the end, so "I want dad instead" should show dad rather than want, and
  // "is she bringing lunch" lunch rather than a verb.
  let best: { url: string; confidence: number } | null = null;
  for (const word of words.slice(0, 4)) {
    const found = await pictureFor(word, 'noun');
    if (!found || found.confidence < MIN_CONFIDENCE) continue;
    if (!best || found.confidence >= best.confidence) best = found;
  }
  return best?.url ?? null;
}

/**
 * Pictures for a set of replies.
 *
 * Every slot is illustrated from its own words, including the three whose
 * POSITIONS are fixed. Pinning those to yes, no and a question mark put the same
 * three pictures on screen every turn regardless of what was said, so "orange
 * juice please" showed a tick — the picture described the slot rather than the
 * reply, which is no use to someone reading the pictures instead of the text.
 * Fixed geometry is the thing worth protecting; fixed pictures are not.
 *
 * Resolved together rather than in sequence. These are looked up while someone is
 * waiting to be answered, and six searches end to end would be felt.
 */
export async function resolveReplyIcons(replies: Replies): Promise<ReplyIcons> {
  const texts = [replies.accept, replies.ask, replies.refuse, ...replies.options];

  const found = await Promise.all(
    texts.map(async (text) => {
      try {
        return [text, await iconForPhrase(text)] as const;
      } catch {
        // A picture is a nicety; failing to find one must not cost the reply.
        return [text, null] as const;
      }
    }),
  );

  const icons: ReplyIcons = {};
  for (const [text, url] of found) {
    if (url) icons[text] = url;
  }
  return icons;
}

export async function generateReplies(
  heard: string,
  context: MomentContext,
  /**
   * Replies already offered for this turn and rejected by asking for new ones.
   * Sent to the model as things not to say again, and folded into the cache key
   * so a second ask cannot be answered from the first ask's entry.
   */
  avoid: string[] = [],
): Promise<{ replies: Replies; cached: boolean; generated: boolean }> {
  const said = heard.trim().slice(0, 400);
  if (!said) throw new Error('Nothing was heard.');

  const rejected = avoid.map((a) => a.trim()).filter(Boolean);
  const key = [
    contextKey(context),
    said.toLowerCase(),
    rejected.map((r) => r.toLowerCase()).sort().join('~'),
  ].join('|');

  const hit = cache.get(key);
  if (hit) return { replies: hit, cached: true, generated: true };

  if (!isReplyGeneratorConfigured()) {
    return { replies: fallbackReplies(), cached: false, generated: false };
  }

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          `They were just told: "${said}"`,
          context.location ? `Where they are: ${context.location}` : null,
          context.situation ? `What they are doing: ${context.situation}` : null,
          `Time of day: ${context.timeBucket}`,
          // They looked at these and asked for others, so repeating any of them
          // wastes the one thing this feature is spending: the listener's patience.
          rejected.length
            ? `They have already been offered these and want different ones. Do not repeat any of them, and do not merely rephrase them:\n${rejected.map((r) => `- ${r}`).join('\n')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  });

  const parsed = response.parsed_output;
  if (!parsed) return { replies: fallbackReplies(), cached: false, generated: false };

  const blank = fallbackReplies();
  const options: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(parsed.options) ? parsed.options : []) {
    const option = tidy(raw, '');
    if (!option || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    options.push(option);
    if (options.length >= OPTION_COUNT) break;
  }
  // Short of a full set, pad from the fallback rather than render a gap. An
  // empty button on a board is a button someone presses by accident.
  for (let i = 0; options.length < OPTION_COUNT; i++) {
    options.push(blank.options[i % blank.options.length]);
  }

  const replies: Replies = {
    accept: tidy(parsed.accept, blank.accept),
    ask: tidy(parsed.ask, blank.ask),
    refuse: tidy(parsed.refuse, blank.refuse),
    options,
  };

  remember(key, replies);
  return { replies, cached: false, generated: true };
}
