# TalkAlotta

Adaptive AAC communication boards. Describe a real situation in plain language and
get a board for that moment, built on top of a fixed board the communicator can
learn by muscle memory.

Built for the caregiver, learns with the communicator.

## Running it locally

Everything is already installed and the keys are already in `.env`.

```bash
npm run dev
```

Open <http://localhost:3000>. First run goes to setup; after that it goes
straight to the board.

Optional but worth doing before a demo:

```bash
npm run warm     # resolves every fixed picture up front (server must be running)
```

Without warming, the first board open takes a few seconds while each fixed word is
looked up for the first time. After that it is instant, because the results are
cached in the database.

### Running it on an iPad

```bash
npm run dev:lan  # binds to 0.0.0.0 so other devices on the wifi can reach it
```

Find the laptop's address (the `Network:` line the dev server prints), open it in
Safari on the iPad, then Share, then Add to Home Screen. It opens without the
browser bars, so it behaves like an app.

One trap: the home screen icon remembers the exact address, and the laptop's
address changes when it joins a different wifi network. Re-add the icon once you
are on the network you will actually demo on.

### Other commands

```bash
npm run reset          # back to first run: clears profile, boards, history
npm run reset -- --pictures --audio   # also clear the picture and speech caches
npm run build          # production build
npm start              # run the production build
npm run typecheck      # TypeScript, no emit
```

`npm run reset` keeps the picture cache on purpose, so you can rehearse the setup
flow repeatedly without waiting for lookups each time.

## How it is put together

```
app/
  page.tsx            first run -> setup, otherwise -> board
  onboarding/         setup, one question per page
  board/              the board, plus every popup that sits over it
  settings/           everything from setup, changeable, plus credit usage
  api/
    scenario/         description -> concepts -> pictures (nothing saved yet)
    boards/           assembled board; save, reopen, delete situation boards
    symbols/          alternative pictures, for the replace flow
    override/         pin a picture to a word, everywhere
    upload/           a caregiver's own photo for a word
    tts/              speech; the key never leaves the server
    profile/          setup answers and the layout they produce
    utterance/        what was spoken, and the numbers behind the future dashboard
    image/[id]/       serves uploaded pictures back out
components/
  Tile.tsx            one board button; every tile is the same box
  SentenceBar.tsx     sentence builder, with the caregiver hamburger
  CaregiverDrawer.tsx caregiver mode, slides in from the left
  ScenarioSheet.tsx   describe a situation, review it, save it
  PictureSheet.tsx    change the picture for a word, or upload one
  DemoControls.tsx    force the time and location, for demos only
  Sheet.tsx           the shared popup frame
lib/
  arasaac.ts          ARASAAC pictograms, the primary picture source
  opensymbols.js      the symbol library client, ported unchanged from the prototype
  symbol-search.ts    per-concept search, confidence scoring, learning layer
  interpret.ts        the one AI call: description -> concepts
  core-words.ts       core words, navigation icons, starter vocabulary
  sizing.ts           tap calibration and eyesight -> grid, spacing, icon scale
  tts.ts              ElevenLabs, buffered and cached
  voice.ts            voice lookup (one stock voice today)
  speech.ts           browser side: iOS audio unlock, fallback voice
  board.ts            board assembly
  db/                 SQLite, tables created on first use
```

## Decisions worth knowing

**One picture library, not four.** ARASAAC is the primary source, which is what
the reference project uses. A board where every picture comes from one library is
easier to read than a mixture of emoji, line art and photographic icons, and
visual consistency matters more in AAC than picking the single best image per
word. A probe across the starter vocabulary found a usable ARASAAC pictogram for
every word tried. OpenSymbols is kept as a rescue for the few words ARASAAC
handles badly: "paint brush" is the clearest case, where ARASAAC's closest match
is a paint roller and Mulberry has an exact paint brush.

**The core words are never searched.** `help`, `yes`, `more`, `want`, `stop`, `no`
and `finished` are hand-drawn SVG in `lib/core-words.ts`. A library search for
"finished" returns a finish-line picture, and these are the buttons that matter
most. Being built in also means the safety-critical ones can never resolve to a
low-confidence match. A caregiver can still replace any of them.

**yes and no sit at opposite ends of the top row.** yes is one in from the left,
no is one in from the right, with four buttons between them, so hitting the wrong
one is hard. yes is green and no is red, following the same convention as the
reference project. To swap those colours, change the `affirm` and `negate` tokens
in `app/globals.css`.

**Navigation buttons never use a searched picture.** A search for "back" returns a
picture of a person's back, which is the wrong image for a button meaning "return
to the previous screen". Every navigation icon is hand-drawn alongside the core
words.

**Every tile is the same box.** Same border, same padding, same picture area, same
label. A folder differs only in its face colour and two absolutely positioned
marks, a tab on the top edge and a small folder glyph, so it can never come out a
different size from the word tile beside it. The border is one subtle dark line
shared by every tile rather than a saturated colour per word type, which is what
keeps a board of mixed colours calm to look at.

**The core words sit outside the adjustable grid.** At the largest button size the
grid holds twelve buttons; the core row plus navigation would have used all of it.
Keeping them in their own strip also means they never move when the grid size
changes, which is the entire point of a fixed position.

**New situation is a teal button in the grid,** not a link at the bottom of the
screen. It opens a popup over the board offering four suggested situations, chosen
for the current time of day and location, so the common cases take one tap instead
of typing.

**Caregiver mode is a drawer from the left,** opened by the hamburger at the far
left of the sentence bar. It deliberately covers only part of the screen, because
turning on edit mode and then changing a picture should happen while looking at
the board being changed. Dashboard, Saved boards, Edit boards, Edit icons and Add
image all work from it; Settings opens its own screen.

**Edit mode changes what a tap does.** With it on, tapping any button opens the
picture chooser for that word instead of speaking it. A chosen picture is pinned to
the word everywhere, not just on the board it was changed from.

**A described situation becomes a folder.** The board stays predictable and the
moment-specific words live one tap inside a folder named after that moment.
Describing a new situation adds a folder rather than rearranging the board.
Reopening a saved board is just tapping its folder.

**Confidence is real now.** It used to be a constant per source, so sorting was
effectively source-only. Each candidate is now scored on whether every word of the
concept is actually present, how specific the match is, and how much the source is
trusted. Anything below the threshold in `lib/symbol-search.ts` is flagged for the
caregiver rather than silently accepted.

**Speech is cached by text, voice and model.** An AAC communicator presses the same
button dozens of times a day. The audio stream is fully buffered into bytes before
it is stored, so a repeat press gets complete audio instead of an already-consumed
stream. The model is part of the cache key, so switching models does not serve back
audio made by the old one.

**A failed AI call does not fall back silently.** The plain keyword filter turns
"I need my red paint brush" into a search for "need my red paint brush" and can put
a pancake on a child's board. If the call fails, the screen says so and offers a
retry.

## Accessibility

- Setup asks one question per page. A caregiver who is not especially technical
  should never have to work out which of four fields still needs an answer.
- The tap calibration sets the spacing between buttons as well as their size.
  For someone with a tremor the gap prevents mis-taps as much as the size does.
- Every press is debounced, so one intended tap cannot say a word twice.
- Buttons are colour-coded by word type, following the Fitzgerald key. Colour is
  never the only signal: every button always shows its word.
- Low vision and cortical visual impairment get fewer buttons, wider spacing, and a
  plain high-contrast background, not just larger text.
- Double-tap zoom, text selection and rubber-band scrolling are disabled on the
  board, so a stray gesture cannot disturb it mid-use.
- Real buttons with real labels throughout, so setup works with a keyboard and
  with VoiceOver.

## Demo controls

Bottom right, there is a control for the time of day and the location. It exists
only for demonstrating: in real use the time comes from the clock and the location
would come from the device, and nobody waits until bedtime to show that the board
changes at bedtime.

Changing either one reassembles the board. The bottom folder swaps to that time of
day, a folder for the location appears, and the four suggested situations change to
match. "Back to the real time, no location" clears both.

## Switching model for the demo

`eleven_flash_v2_5` is used during development because it is about half the cost.
For the demo, change one line in `.env`:

```
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Settings shows how many characters have been sent and how many presses the cache
served for free.

## Not built yet

Each of these has a `TODO` at the place the work goes.

- **Accent and gender matched voices.** `lib/voice.ts` has an empty lookup table
  and one stock voice. The setup answers are already asked, stored and confirmed,
  so adding voices is a change to that table alone.
- **Speaking the situation aloud.** `app/describe/page.tsx` has the marker. Typing
  works today.
- **The dashboard of most-said sentences.** The data is recorded from the first
  press; `GET /api/utterance` returns it, and Settings shows the top sentences.
- **Real location detection.** The location context itself is built and visible
  through the demo controls; what is missing is getting the location from the
  device rather than being told.
- **A therapist review of the starter vocabulary.**

## Deployment note

The database is a local SQLite file, so it needs a real filesystem. That works
locally and on any always-on host. A serverless deploy cannot keep it, so a hosted
copy would start empty on each cold start. Everything goes through `lib/db/index.ts`,
so moving to a networked SQLite such as Turso is a change to that one file.

## Picture credits, and one licensing catch

Pictures come mostly from ARASAAC, with OpenSymbols libraries including Mulberry
and Tawasol as a fallback. Licence and author are recorded with every picture and
shown in Settings.

The catch: **ARASAAC pictograms are CC BY-NC-SA, which is non-commercial.** That is
fine for a hackathon and it needs attribution, but because ARASAAC is now the
primary source, most of the board carries a non-commercial licence. The route to a
commercial release is Mulberry, which is CC BY-SA and already reachable through the
OpenSymbols client: reorder `SOURCE_TRUST` in `lib/symbol-search.ts` to put
`mulberry` first.

## Keys

`.env` is gitignored and holds the ElevenLabs, Anthropic and OpenSymbols
credentials. All three have been pasted into chat transcripts at some point, so
treat them as exposed and rotate them after the event.
