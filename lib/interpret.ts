import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { extractKeywords } from './opensymbols';
import type { WordRole } from './core-words';

/**
 * The ONLY AI component in the product: turning a natural-language description
 * of a moment into concrete, picturable concepts. Ranking, personalisation and
 * the learning loop are ordinary algorithms, not further model calls.
 *
 * Why this layer exists at all: the plain stop-word filter has no semantic
 * understanding, so "I need my red paint brush" was sent as "need my red paint
 * brush". Filler words became search terms, "paint brush" was split in two, and
 * a pancakes symbol came back sixth. Extracting concepts first fixes that at
 * the source.
 *
 * Reliability: the response is constrained with a JSON schema through
 * messages.parse, so a malformed reply is not a failure mode we have to defend
 * against with hand-rolled parsing. If the call fails outright we say so rather
 * than silently dropping to the stop-word path, because a quietly bad board is
 * worse than a visible retry.
 */

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';

const VALID_ROLES: WordRole[] = ['object', 'action', 'feeling', 'place', 'modifier', 'core'];

const SYSTEM_PROMPT = `You turn a phrase used in an AAC (augmentative and alternative communication) setting into concepts to look up in a picture-symbol library.

Rules:
- Return 2 to 8 concepts, most important first.
- Each term must be concrete and picturable, the kind of word a symbol library indexes: "paint brush", "drink", "toilet", "angry".
- Keep compound nouns intact: "paint brush", never "paint" plus "brush".
- Split genuinely separate ideas into separate concepts.
- Drop filler, possession and politeness words: i, need, my, the, please, a.
- role is one of:
  object   a thing
  action   something done
  feeling  an emotion or body state
  place    a location
  modifier a colour, size or quantity describing another concept
  core     AAC core vocabulary worth putting on the board: want, more, help, stop, finished
- modifies is the term a modifier applies to, otherwise null.
- intent is one of: request, comment, feeling, question, direction, social.
- board_name is a short label for this board, two or three words, lowercase, no punctuation. It names the moment, for example "art class" or "dinner time".`;

const CONCEPT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['request', 'comment', 'feeling', 'question', 'direction', 'social'],
    },
    board_name: { type: 'string' },
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          role: {
            type: 'string',
            enum: ['object', 'action', 'feeling', 'place', 'modifier', 'core'],
          },
          modifies: { type: ['string', 'null'] },
        },
        required: ['term', 'role', 'modifies'],
        additionalProperties: false,
      },
    },
  },
  required: ['intent', 'board_name', 'concepts'],
  additionalProperties: false,
} as const;

export interface Concept {
  term: string;
  role: WordRole;
  modifies: string | null;
}

export interface Interpretation {
  intent: string;
  boardName: string;
  concepts: Concept[];
  /** Which path produced this: the model, or the plain keyword filter. */
  via: 'model' | 'keywords';
  model?: string;
}

export function isInterpreterConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function tidyConcepts(raw: { term: string; role: string; modifies: string | null }[]): Concept[] {
  const seen = new Set<string>();
  const out: Concept[] = [];
  for (const c of raw) {
    const term = String(c?.term ?? '')
      .trim()
      .toLowerCase();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const role = String(c?.role ?? '').toLowerCase() as WordRole;
    out.push({
      term,
      role: VALID_ROLES.includes(role) ? role : 'object',
      modifies: c?.modifies ? String(c.modifies).trim().toLowerCase() : null,
    });
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * The fallback when there is no API key at all. Kept deliberately separate and
 * labelled, so a board built this way can be shown as degraded rather than
 * passed off as the good path.
 */
export function interpretWithKeywords(scenario: string): Interpretation {
  const keywords = extractKeywords(scenario);
  return {
    intent: 'unknown',
    boardName: keywords.slice(0, 2).join(' ') || 'new board',
    concepts: keywords.slice(0, 8).map((term) => ({ term, role: 'object' as WordRole, modifies: null })),
    via: 'keywords',
  };
}

export async function interpretScenario(scenario: string): Promise<Interpretation> {
  const text = scenario.trim();
  if (!text) throw new Error('Describe the situation first.');

  if (!isInterpreterConfigured()) {
    return interpretWithKeywords(text);
  }

  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: text }],
    output_config: { format: jsonSchemaOutputFormat(CONCEPT_SCHEMA) },
  });

  const parsed = response.parsed_output;
  if (!parsed || !Array.isArray(parsed.concepts)) {
    throw new Error('The language model did not return usable concepts.');
  }

  const concepts = tidyConcepts(
    parsed.concepts as { term: string; role: string; modifies: string | null }[],
  );
  if (concepts.length === 0) {
    throw new Error('The language model returned no usable concepts.');
  }

  return {
    intent: String(parsed.intent ?? 'unknown'),
    boardName: String(parsed.board_name ?? '').trim() || text.slice(0, 24),
    concepts,
    via: 'model',
    model: response.model ?? MODEL,
  };
}
