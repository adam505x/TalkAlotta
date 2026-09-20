import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { contextKey, type MomentContext } from './context';

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

export async function generateReplies(
  heard: string,
  context: MomentContext,
): Promise<{ replies: Replies; cached: boolean; generated: boolean }> {
  const said = heard.trim().slice(0, 400);
  if (!said) throw new Error('Nothing was heard.');

  const key = `${contextKey(context)}|${said.toLowerCase()}`;
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
