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

### Running it on an iPad, without the browser bars

```bash
npm run dev:lan  # binds to 0.0.0.0 so other devices on the wifi can reach it
```

Open the address the dev server prints under `Network:` in Safari on the iPad,
then Share, then Add to Home Screen. Launching from that icon gives a plain
full-screen app: no address bar, no toolbar at the bottom.

What makes that work, since adding a random website usually keeps the bars:

- **The web app manifest is what decides it.** On iOS 17 and later, a site added
  to the Home Screen opens as a Home Screen web app when its manifest sets
  `display` to `standalone` or `fullscreen`. Ours is at
  `public/manifest.webmanifest` and is linked from the page head.
- **The manifest needs real icons.** An empty `icons` array is the usual reason a
  site that looks correctly configured still opens with the bars, and it also
  makes iOS fall back to a screenshot for the Home Screen icon. `npm run icons`
  generates the three PNGs the manifest points at.
- **`apple-touch-icon` is separate** from the manifest icons and is what iOS
  actually puts on the Home Screen.
- **The old meta tag is still worth having.** `apple-mobile-web-app-capable` is
  what iOS before 17 used, and it is no longer the recommended mechanism, but it
  costs nothing and covers an older iPad. Next emits the modern
  `mobile-web-app-capable` by itself and does not emit the Apple one, so it is set
  explicitly in `app/layout.tsx`.
- **iOS 26 and later** open every site added to the Home Screen as a web app
  regardless, so on a current iPad this is belt and braces.

Two practical traps:

- The Home Screen icon remembers the exact address, and the laptop's address
  changes when it joins a different wifi network. Re-add the icon once you are on
  the network you will demo on.
- If you added the icon before these changes, delete it and add it again. iOS
  reads the manifest at the moment you add it and does not revisit that decision.

Sources: [WebKit features in Safari 16.4](https://webkit.org/blog/14445/webkit-features-in-safari-16-4/),
[What's new in web apps, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10120/),
[iOS PWA compatibility](https://firt.dev/notes/pwa-ios/),
[Web app manifest](https://web.dev/learn/pwa/web-app-manifest).

### Other commands

```bash
npm run reset          # back to first run: clears profile, boards, history
npm run reset -- --pictures --audio   # also clear the picture and speech caches
npm run build          # production build
npm start              # run the production build
npm run typecheck      # TypeScript, no emit
npm run icons          # regenerate the Home Screen icons
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

**The core block is three fixed rows of seven.** Laid out the way core boards
conventionally are: pronouns and question words on the left, verbs through the
middle, describing words down the right edge. Clustering like-coloured words
together is what makes a board scannable rather than a patchwork. It is a mixture
on purpose, not just verbs.

```
I      yes    you    want   go     no     more
she    it     that   help   stop   like   finished
what   where  who    do     put    give   good
```

**The buttons that matter most are never searched.** `help`, `yes`, `more`,
`want`, `stop`, `no` and `finished` are hand-drawn SVG in `lib/core-words.ts`. A
library search for "finished" returns a finish-line picture, and being built in
means the safety-critical ones can never resolve to a low-confidence match. The
other fourteen resolve from the library once and are cached like any fixed word.
A caregiver can replace any of them from edit mode.

**yes and no sit at opposite ends of the top row.** yes is one in from the left,
no is one in from the right, with four buttons between them, so hitting the wrong
one is hard. yes is green and no is red, following the same convention as the
reference project. To swap those colours, change the `affirm` and `negate` tokens
in `app/globals.css`.

**Navigation buttons never use a searched picture.** A search for "back" returns a
picture of a person's back, which is the wrong image for a button meaning "return
to the previous screen". Every navigation icon is hand-drawn alongside the core
words.

**Every tile is the same shape and the same size.** Each one is a slightly
elongated square, fixed by `aspect-ratio` rather than stretched to fill whatever
slice of the grid it lands in. That stretching was why the same button came out
square on one board and a wide rectangle on another. The fixed top row uses the
same column count as the grid below it, so a core word and a folder are identical
in size. The border is one subtle dark line shared by every tile rather than a
saturated colour per word type, which keeps a board of mixed colours calm.

**The column count is the only size control.** Because height follows from the
aspect ratio, picking a column count sets the size of every button on the board.
The ladder runs from seven columns up to ten. Seven is the floor: the core block
is seven wide, and both grids have to share a column width for their tiles to
match. When the grid is wider than seven, the spare slots in each core row are
left empty in the middle, so the describing column stays against the right edge
and yes and no keep their places. The folder rows underneath are kept few enough
that the whole board fits a landscape tablet without scrolling.

**A folder is not a different-looking object.** It takes its colour from what is
inside it, exactly like a word does: the doing folder is verb green, the feelings
folder is pink. The only thing marking it as a folder is a small tab on its top
edge, absolutely positioned so it costs no space.

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

**Edit mode changes what a tap does.** With it on, tapping a word opens the picture
chooser for it instead of speaking, and tapping a folder offers to remove it. A
chosen picture is pinned to the word everywhere, not just on the board it was
changed from. A built-in folder is hidden rather than deleted, so it can be
brought back; a saved situation folder is deleted outright, because the caregiver
made it in the first place.

**Every folder carries an add button.** Open a folder and the last tile is "add
icon": type a word, a picture is found for it, and it joins that folder. A word
with no usable picture is refused rather than added blank.

**Four folders, always the same four.** People, doing, things, describing. Every
situation decomposes into those, so the folders themselves never move or change
in number; only what is inside them changes. That is what keeps the board
learnable while still being different in every place.

**What goes inside comes from the moment.** The time of day, where the person is,
the weather, and any activity that has been typed in. It is generated rather than
looked up, because nobody can hand-write a word list for every venue and the
specific cases are the whole point: a Chick-fil-A gives server, order, sandwich,
chips and salty; a tennis court gives coach, serve, racket and fast; the same park
gives a slide and sand when it is sunny and a puddle, an umbrella and slippery
when it is raining.

Each folder holds about five words, never more than six. Past that a folder stops
being something you can scan.

**Typing a situation refills the same four folders.** Knowing someone is at school
does not tell you they are in an art class, which is the gap New situation fills.
It does not add a folder or rearrange anything.

**Everything is cached by the moment.** The same place at the same time of day in
the same weather shows the same words and costs nothing the second time. A board
that reshuffled itself between visits would undo the muscle memory the fixed
layout exists to build.

**Adding a word teaches it where that word belongs.** Add "Liam" while the board
is at school and Liam is pinned to school: he comes back on the next visit and
stays off the board at home. Automatic removal of words that stop being pressed is
the other half, and needs a press history before it can mean anything.

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

**A described situation fills a board, not an echo.** The extraction is asked for
the words someone would actually need in that moment, not only the words the
sentence contains. "Art class, choosing between paint and pencils" returns paint,
pencils, brush, paper, draw, colour, apron, wash hands, excited and messy, rather
than the two things that were named.

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

The round logo button in the bottom right opens time of day, place and weather.

It exists only for demonstrating. In real use the time comes from the clock and
the place and weather from the device, and nobody waits for rain to show that the
board offers an umbrella when it rains. It is tucked behind a small round button
on purpose: it is the one control on screen that belongs to whoever is
demonstrating rather than to the communicator.

Place is a text box with quick presets, so you can tap School or type Chick-fil-A
and get what that business actually sells.

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
