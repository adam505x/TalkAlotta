import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { eq } from 'drizzle-orm';
import { db, schema } from './db';
import { contextKey, describeContext, type MomentContext } from './context';
import { arasaacPicture } from './core-words';

/**
 * Works out what belongs in the four folders for the moment the board is in.
 *
 * Every situation decomposes the same way: the PEOPLE there, the ACTIONS you
 * might take, the THINGS in front of you, and the DESCRIBING words you would
 * reach for. That fixed shape is the point. The folders never move, so a
 * communicator always knows where to look; only what is inside them changes.
 *
 * This has to be generated rather than looked up. Nobody can hand-write a word
 * list for every venue, and the interesting cases are exactly the specific ones:
 * a Chick-fil-A wants server, order, burger, spicy, and a tennis court wants none
 * of those.
 *
 * Everything is cached by the moment, so returning to the same place at the same
 * time of day in the same weather costs nothing and shows the same words. Stable
 * boards matter more here than fresh ones.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

/** About five generated per folder. Extra caregiver words page rather than crowding. */
export const PER_FOLDER = 5;

export const FOLDER_IDS = ['people', 'actions', 'things', 'describing'] as const;
export type FolderId = (typeof FOLDER_IDS)[number];

export const FOLDER_LABELS: Record<FolderId, string> = {
  people: 'people',
  actions: 'doing',
  things: 'things',
  describing: 'describing',
};

/**
 * The picture on each context folder's button.
 *
 * Fixed, deliberately. What is INSIDE these four folders is refilled every time
 * the context changes, and the button used to wear the first word's picture, so
 * the same folder in the same place showed a different picture at a restaurant
 * than at the park. These four are the one part of the strip that never moves;
 * looking different every hour is the opposite of what that is for.
 *
 * The same pictograms the matching core folders use, so `doing` and Actions are
 * one idea with one picture.
 */
export const FOLDER_ICONS: Record<FolderId, string> = {
  people: arasaacPicture(7116),
  actions: arasaacPicture(32067),
  things: arasaacPicture(11318),
  describing: arasaacPicture(32584),
};

/**
 * The people who are relevant wherever you are. They are prepended to whatever
 * the model returns, so a communicator can always ask for the person who brought
 * them, in any place, without waiting for a model to think of it.
 */
export const ALWAYS_PEOPLE = ['mum', 'dad'];

const SYSTEM_PROMPT = `You fill a communication board for someone who talks using picture symbols.

You are given the moment they are in: the time of day, where they are, the weather, and sometimes an activity they have told us about.

Return the words they would most plausibly need RIGHT THEN, split into exactly four groups:
- people: who is there with them, by role, for example "server", "teacher", "friend"
- actions: what they might do or ask to do, for example "order", "pay", "eat"
- things: the objects in front of them, for example "burger", "chips", "menu"
- describing: how they might describe it or how they feel about it, for example "hot", "spicy", "yucky", "loud"

Rules:
- Exactly ${PER_FOLDER} words in each group.
- Each word must be concrete and picturable, the kind of word a picture-symbol library indexes. Prefer one or two plain words.
- Be specific to the place given. A restaurant is not a park. If a named business is given, use what that business actually sells.
- Do not repeat a word between groups.
- Do not include: I, you, yes, no, want, more, help, stop, finished, go, like, do, put, give, good, what, where, who, she, it, that. Those are permanently on the board already.
- Do not include family carers such as "mum" or "dad"; they are added separately.
- Lowercase, no punctuation.
- Use British and Irish spelling and vocabulary: colour not color, neighbour not neighbor, chips not fries, crisps not chips, jumper not sweater, rubbish not trash.`;

const SCHEMA = {
  type: 'object',
  properties: {
    people: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    things: { type: 'array', items: { type: 'string' } },
    describing: { type: 'array', items: { type: 'string' } },
  },
  required: ['people', 'actions', 'things', 'describing'],
  additionalProperties: false,
} as const;

export type FolderWords = Record<FolderId, string[]>;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function isGeneratorConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function tidy(list: unknown, limit: number): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const word = String(raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .slice(0, 30);
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * A plain fallback, used when there is no API key. Deliberately generic, and
 * labelled as such by the caller, rather than pretending to know the place.
 */
function fallbackWords(): FolderWords {
  return {
    people: ['friend', 'teacher', 'helper', 'someone', 'everyone'],
    actions: ['eat', 'drink', 'play', 'look', 'wait'],
    things: ['drink', 'food', 'toilet', 'coat', 'bag'],
    describing: ['happy', 'sad', 'tired', 'loud', 'nice'],
  };
}

export async function generateFolders(
  context: MomentContext,
): Promise<{ words: FolderWords; cached: boolean; generated: boolean }> {
  const key = contextKey(context);

  const hit = db
    .select()
    .from(schema.contextFolders)
    .where(eq(schema.contextFolders.cacheKey, key))
    .get();
  if (hit) {
    try {
      return { words: JSON.parse(hit.payload) as FolderWords, cached: true, generated: true };
    } catch {
      // A corrupt row should not break the board; fall through and regenerate.
    }
  }

  if (!isGeneratorConfigured()) {
    return { words: fallbackWords(), cached: false, generated: false };
  }

  const described = describeContext(context);
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          `Time of day: ${context.timeBucket}`,
          `Where they are: ${context.location ?? 'not known'}`,
          `Weather: ${context.weather ?? 'not known'}`,
          context.situation ? `What they are doing: ${context.situation}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error(`Could not work out words for ${described}.`);

  const words: FolderWords = {
    people: tidy(parsed.people, PER_FOLDER),
    actions: tidy(parsed.actions, PER_FOLDER),
    things: tidy(parsed.things, PER_FOLDER),
    describing: tidy(parsed.describing, PER_FOLDER),
  };

  db.insert(schema.contextFolders)
    .values({
      cacheKey: key,
      context: describeContext(context),
      payload: JSON.stringify(words),
    })
    .onConflictDoNothing()
    .run();

  return { words, cached: false, generated: true };
}
