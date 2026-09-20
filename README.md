# TalkAlotta

An AAC communication board that changes with the moment, built on top of a fixed
board the communicator learns by muscle memory.

Two things adapt. The four folders at the bottom refill themselves from where the
person is, what time it is, the weather, and any activity a caregiver has
described. And conversation mode listens to whoever is talking *to* them and puts
replies on screen they can press.

Everything above those folders never moves.

Built for the caregiver, learns with the communicator.

## Try it

**<https://talkalotta-production.up.railway.app/board>**

It opens on setup the first time. If you want to skip straight to the board and
poke at it, answer the questions quickly — none of them are required to be
accurate, and everything can be changed afterwards from Settings.

## Who built this, and why

TalkAlotta was built by **Adam McIntyre**, **Liam Maher** and **Josie Burke**,
three students at University College Dublin. We flew to Boston to build it for
HackMIT 2026.

We each have family members and friends who use AAC boards, so this was personal
rather than chosen off a list of ideas. We know the difficulties first hand: the
conversation that ends because the answer was four folders deep and somebody
answered on your behalf; the board that is perfect at home and useless in a cafe;
the two hundred and fifty dollar price tag on the app that does it best. Those
three things are what this project is aimed at, in that order.

## How it works

Setup asks a short series of questions about the communicator, one per page: age,
gender, nationality, eyesight, colour vision, and a tapping exercise that measures
how far off target a tap lands. Those answers set the size of every button, the
space between them, the palette, and the accent of the voice.

The board that opens is in two halves.

**The top three rows never change.** Four pages of core vocabulary, the same words
in the same places every time, with yes, no, back and next in fixed corners. This
is the half a communicator learns by muscle memory, and nothing the app does is
allowed to move it.

**The strip underneath changes constantly.** It holds the situation button and
four folders — people, doing, things, describing — and what is inside those four
is worked out from the moment: the time of day, where the person is, the weather,
and any activity a caregiver has typed or spoken in. At a Chick-fil-A they fill
with server, order, sandwich, chips and salty. On a tennis court, coach, serve,
racket and fast. The same park gives a slide and sand when it is sunny and a
puddle, an umbrella and slippery when it is raining. The four folders themselves
never move or change in number, so only the contents are ever new.

Pressing a word speaks it through Deepgram and adds it to the sentence bar.
Pressing the bar speaks the whole sentence as one utterance, so it carries real
intonation instead of sounding like a list of words read out.

Behind the situation button there is a second tab: **conversation mode**. Turn it
on and the board listens to the person talking *to* the communicator, and puts six
replies on screen that they can press. The words are generated; the positions are
fixed.

## What is in it

- **Onboarding that sets the whole board.** One question per page, and a tap test
  that sets button size and spacing together, because for someone with a tremor
  the gap prevents mis-taps as much as the size does.
- **Context-aware folders.** Four folders that refill from place, time, weather
  and a described situation, cached so returning somewhere shows the same words.
- **Conversation mode.** Listens to the other person and offers replies, with a
  guaranteed refusal in a fixed position on every turn.
- **Custom voice.** Age, gender and nationality resolve to a Deepgram Aura voice
  and accent, changeable afterwards.
- **Your own buttons.** Add a word to any folder; a picture is found for it, and a
  word with no usable picture is refused rather than added blank.
- **Your own pictures.** Upload a photo for any word from the picture sheet. It is
  pinned to that word everywhere, not just where it was changed.
- **Custom phrases.** Pin a whole sentence as a single button, so something said
  often is one press instead of six.
- **Colour blind mode.** Setup asks about colour vision separately from eyesight,
  and the palette changes rather than the layout.
- **Adjustable spacing and size.** Button scale and gap are set by the tap test
  and adjustable afterwards from the Settings panel.
- **Analytics for caregivers.** Every press, folder open and deletion is recorded,
  and the dashboard turns that into what is actually being used and what is not.
- **Edit mode.** Tapping a word opens its picture chooser instead of speaking it,
  so a caregiver can fix the board while looking at the board.

## Running it locally

### The keys you need

Copy `.env.example` to `.env` and fill it in. Only the first two are
load-bearing, and the app degrades rather than crashing without either:

| Key | Where to get it | What breaks without it |
|---|---|---|
| `DEEPGRAM_API_KEY` | <https://console.deepgram.com> — free credit on signup | Speech falls back to the browser's own voice; the microphone and conversation mode stop working |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com> | The four folders fall back to a generic word list, and conversation mode offers generic replies |
| `OPENSYMBOLS_SECRET` | <https://www.opensymbols.org> | The fallback picture library throws rather than degrading, so leave `SYMBOL_SEARCH=legacy` and expect ARASAAC to carry it |
| `ELASTIC_NODE`, `ELASTIC_API_KEY` | <https://cloud.elastic.co> | Nothing — only needed if you set `SYMBOL_SEARCH=elastic` |

`ANTHROPIC_MODEL` defaults to `claude-haiku-4-5`, which is the right trade for
this: the folders and the replies both need to be fast more than they need to be
clever.

Then:

```bash
npm install
npm run dev
```

If you are on the team, everything is already installed and the keys are already
in `.env`, so `npm run dev` is the whole of it.

Open <http://localhost:3000>. First run goes to setup; after that it goes
straight to the board.

Optional but worth doing before a demo:

```bash
npm run warm     # resolves every fixed picture up front (server must be running)
```

Without warming, the first board open takes a few seconds while each fixed word is
looked up for the first time. After that it is instant, because the results are
cached in the database.

`GET /api/health` reports what the running process can actually see: which keys
are set, which search backend is live, whether the database is writable. It is
the fastest way to tell a missing key from a broken one.

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

One thing that will not work over the LAN: **the microphone.** Recording needs a
secure context, which means https or localhost, and a bare LAN address is
neither. The situation microphone and conversation mode both say so rather than
failing silently. Demo those from the laptop.

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
npm run symbols:index  # build the Elasticsearch pictogram index
npm run symbols:images # add multimodal embeddings to that index
npm run symbols:check  # sanity-check what the index returns
```

`npm run reset` keeps the picture cache on purpose, so you can rehearse the setup
flow repeatedly without waiting for lookups each time.

Two diagnostics live in `scripts/` and are not part of the app. `voice-lab.mjs`
renders one word many ways through Deepgram and writes the wavs, for when a word
sounds wrong and you need to know whether the fault is Deepgram's or ours.
`run-structure.mjs` splits a clip on silence and prints what it finds, which is
how the "in-in" and "same-ba" artifacts were identified as real rather than
imagined.

## How it is put together

```
app/
  page.tsx            first run -> setup, otherwise -> board
  onboarding/         setup, one question per page
  board/              the board, plus every panel that sits over it
  settings/           a redirect; settings is now a panel over the board
  api/
    boards/           assembled board; save, reopen, delete situation boards
    folders/          add a button or a folder, remove a folder
    phrases/          pin a whole sentence as its own button
    replies/          what was said to them -> replies they can press
    stt/              speech to text, for the situation box and conversation mode
    tts/              speech; the key never leaves the server
    symbols/          alternative pictures, for the replace flow
    override/         pin a picture to a word, everywhere
    upload/           a caregiver's own photo for a word
    image/[id]/       serves uploaded pictures back out
    profile/          setup answers and the layout they produce
    analytics/        every press, folder open and deletion
    dashboard/        those events turned into something a caregiver can read
    deletion/         words taken back out of the sentence bar
    utterance/        what was spoken, and what speech has cost
    health/           what the running process can see
components/
  Tile.tsx            one board button; every tile is the same box
  SentenceBar.tsx     sentence builder, with the caregiver hamburger
  CaregiverDrawer.tsx caregiver mode, slides in from the left
  ScenarioSheet.tsx   two tabs: describe the situation, or listen and reply
  ConversationMode.tsx listens to the other person, offers replies
  MicButton.tsx       wraps a text field so it can be spoken into
  SettingsSheet.tsx   settings, as a panel over the board
  DashboardSheet.tsx  how the board is actually being used
  PictureSheet.tsx    change the picture for a word, or upload one
  AddThingSheet.tsx   add a button or a folder
  DemoControls.tsx    force the time, place and weather, for demos only
  Sheet.tsx           the shared panel frame
lib/
  core-board.ts       the fixed board: four pages, the folders, the pinned row
  core-words.ts       hand-drawn icons, starter vocabulary, time of day
  board.ts            board assembly
  context.ts          the moment: time, place, weather, described activity
  generate-folders.ts what goes in the four dynamic folders
  replies.ts          what to say back to what was just said
  folder-id.ts        core and dynamic folder ids, kept apart on purpose
  phrases.ts          pinned sentences
  arasaac.ts          ARASAAC pictograms, the primary picture source
  opensymbols.js      the symbol library client, ported from the prototype
  elastic-symbols.ts  optional Elasticsearch retrieval over both libraries
  symbol-search.ts    per-concept search, confidence scoring, learning layer
  tts.ts              Deepgram Aura, trimmed, levelled and cached
  stt.ts              Deepgram Nova-3
  voice.ts            accent and voice resolution
  speech.ts           browser side: iOS audio unlock, fallback voice
  analytics.ts        press history
  dashboard.ts        press history -> a caregiver's view of it
  sizing.ts           tap calibration and eyesight -> grid, spacing, icon scale
  color-vision.ts     colour vision answer -> a palette that survives it
  db/                 SQLite, tables created and migrated on first use
```

## The board itself

Three rows of seven, four pages deep, and a strip underneath. The strip is the
only part that changes.

Four of the twenty-one cells are reserved on every page and never hold anything
else: yes, no, back and next. The rest fill in order around them.

```
PAGE 1  the sentence engine
  I        yes      you      it       that     no       not
  People   want     go       like     do       help     stop
  back     Actions  more     finished good     again    next

PAGE 2  grammar and the world
  he       yes      she      here     in       no       on
  up       get      make     put      open     turn     look
  back     Places   Things   Numbers  some     all      next

PAGE 3  asking and doing
  what     yes      where    who      why      no       when
  Questions Describe same    different Little words wait can
  back     eat      drink    play     sleep    wash     next

PAGE 4  social language, with room to grow
  please   yes      thank you sorry   my turn  no       Chat
  Food     Emotions Time
  back                                                  next

STRIP
  situation  People  doing  things  describing  my phrases
```

Folders sit beside the words they extend, not gathered into one corner: Places
next to the locative prepositions, Things next to the object verbs, Questions
next to the question words.

**yes and no never move, on any screen.** They hold slots two and six of the top
row on every core page, and the same two slots in the pinned row at the top of
every core folder, so a communicator never has to navigate out of a folder
mid-conversation to say yes. They sit with three buttons between them so a
mis-tap cannot turn a refusal into an agreement.

A core folder opens into the same twenty-one cells: the pinned row (I, yes, want,
like, more, no, stop), then the folder's own words. Thirteen words fit on one
screen, using next's corner as a word; past that next reappears and the folder
pages. That is the opposite of how the dynamic folders in the strip behave, and
the next section explains why.

## Decisions worth knowing

**The core folders and the dynamic folders are different things that share
names.** There is a core "Actions" folder on page 1 and a dynamic "doing" folder
in the strip. The core one is a fixed vocabulary that never changes. The dynamic
one is whatever this moment calls for. They can be open at the same time, because
they are separate places: closing one leaves the other exactly where it was. That
took splitting the board's single `openFolder` into `openCore` and `openDynamic`
in `app/board/page.tsx`.

**A dynamic folder holds five words and has no next button.** Five is what fits
beside back in one strip. A folder that rewrites itself is only trustworthy if a
glance takes all of it in: a word hidden on page two of a folder that refills
itself is a word nobody knows is there. Overflow is dropped rather than paged, and
a caregiver's own words are gathered first, so they are the ones that keep their
places.

**Four folders, always the same four.** People, doing, things, describing. Every
situation decomposes into those, so the folders themselves never move or change in
number; only what is inside them changes. That is what keeps the board learnable
while still being different in every place.

**What goes inside comes from the moment.** The time of day, where the person is,
the weather, and any activity that has been typed or spoken in. It is generated
rather than looked up, because nobody can hand-write a word list for every venue
and the specific cases are the whole point: a Chick-fil-A gives server, order,
sandwich, chips and salty; a tennis court gives coach, serve, racket and fast; the
same park gives a slide and sand when it is sunny and a puddle, an umbrella and
slippery when it is raining.

**Everything is cached by the moment.** The same place at the same time of day in
the same weather shows the same words and costs nothing the second time. A board
that reshuffled itself between visits would undo the muscle memory the fixed
layout exists to build.

**Adding a word teaches it where that word belongs.** Add "Liam" while the board
is at school and Liam is pinned to school: he comes back on the next visit and
stays off the board at home.

**Describing a situation refills the same four folders.** Knowing someone is at
school does not tell you they are in an art class, which is the gap the situation
button fills. It does not add a folder or rearrange anything. It can be spoken
rather than typed, because the caregiver doing this has a child in one hand, and
the transcript lands in the box rather than being submitted, so a misheard word is
corrected before the board changes.

**Every tile is the same shape and the same size.** Each one is a slightly
elongated square, fixed by `aspect-ratio` rather than stretched to fill whatever
slice of the grid it lands in. The strip underneath shares the same seven columns
as the rows above, so a folder and a core word are identical in size and nothing
shifts sideways when a folder opens.

**A folder is drawn as a folder, inside the same footprint.** It takes its colour
from what is inside it, exactly like a word does, and is marked as a folder by a
lip on its top left rather than by a different colour or a badge. The shape is
drawn inside the existing tile box, so a folder can never move a word.

**The buttons that matter most are never searched.** `help`, `yes`, `more`,
`want`, `stop`, `no` and `finished` are hand-drawn SVG in `lib/core-words.ts`. A
library search for "finished" returns a finish-line picture, and being built in
means the safety-critical ones can never resolve to a low-confidence match. Every
navigation icon is hand-drawn for the same reason: a search for "back" returns a
picture of a person's back.

**One picture library, not four.** ARASAAC is the primary source. A board where
every picture comes from one library is easier to read than a mixture of emoji,
line art and photographic icons, and visual consistency matters more in AAC than
picking the single best image per word. OpenSymbols is kept as a rescue for the
few words ARASAAC handles badly: "paint brush" is the clearest case, where
ARASAAC's closest match is a paint roller and Mulberry has an exact paint brush.

**Confidence is real.** Each candidate is scored on whether every word of the
concept is actually present, how specific the match is, and how much the source is
trusted. Anything below the threshold in `lib/symbol-search.ts` is flagged for the
caregiver rather than silently accepted.

**Retrieval has two backends.** `SYMBOL_SEARCH` defaults to `legacy`, which queries
ARASAAC and OpenSymbols live, so a checkout with no Elastic credentials behaves
exactly as it always did. Set it to `elastic` once `npm run symbols:index` has
built the index. Either way the app falls back to the live path on any Elastic
error, and `ELASTIC_TIMEOUT_MS` caps how long a board open will wait before giving
up on it.

**An uploaded photo fills its tile.** Library pictograms are drawn square on
transparent space, so `object-fit: contain` shows all of one and the empty margin
is the artwork's own. A photo off a phone is a rectangle, and `contain` shrinks a
portrait until its height fits, leaving bars down both sides. Uploads are told
apart by URL, since they are the ones served from `/api/image`, and get `cover`
instead.

**Settings is a panel over the board, not a page instead of it.** The things it
changes are judged by looking at the board, so leaving the board to change them
took that away. `/settings` is kept as a redirect so an old link still lands
somewhere sensible.

**Edit mode changes what a tap does.** With it on, tapping a word opens the
picture chooser instead of speaking, and tapping a folder offers to remove it. A
chosen picture is pinned to the word everywhere, not just on the board it was
changed from. A built-in folder is hidden rather than deleted, so it can be
brought back; a folder the caregiver made is deleted outright.

**A failed AI call does not fall back silently.** A plain keyword filter turns "I
need my red paint brush" into a search for "need my red paint brush" and can put a
pancake on a child's board. If a call fails, the screen says so and offers a retry.

## Conversation mode

Behind the situation button, as a second tab beside "Describe the situation".

The thing that ends most conversations with an AAC user is not the board, it is
the wait. Someone asks a question, the answer is four folders deep, and by the
time it is built the asker has answered for them. Conversation mode listens to the
question and puts six plausible answers under their hand while the other person is
still looking at them.

**The words are generated. The positions are not.** Slot one is always the
accepting answer, slot two a question back, slot three the refusal, and slots four
to six are replies specific to what was said. Generated content that moved around
would undo the premise of the whole board, because the reason a communicator gets
fast is that their hand knows where "yes" lives before their eyes find it.

**There is always a refusal, and it is never beside the acceptance.** A system
that suggests replies is putting words in someone's mouth, and the one thing it
must never make hard to reach is "no". If the model fails to produce a real
refusal, a plain one is substituted. Nobody should accept an invitation because
declining it took four taps.

**A segment is not a turn.** Someone saying "we could play ball, we could play
cards, *[pause]* or we could watch TV" is making one offer with a breath in the
middle of it. Treating that breath as the end produced replies about television
and threw the ball and the cards away. So there are two clocks: after 900ms of
quiet a *segment* closes and goes to Deepgram, because waiting longer would mean
no replies until the speaker had finished entirely, and only after 2.5s does the
*turn* close. Everything in between is joined in the order it was spoken and the
replies are worked out from the whole thing, so a long sentence makes the buttons
improve as it goes rather than replace themselves. A segment claims its place in
the turn when it is cut, not when its transcript returns, so two segments
transcribing at different speeds cannot be stitched together backwards.

**The speech threshold is measured, not assumed.** A hackathon hall, a classroom
and a kitchen are nothing alike. The first 700ms of a session are taken as ambient
and the bar is set above whatever is actually in the room.

**The microphone is open only while the panel says it is listening**, only
complete segments leave the device, and nothing is kept after the transcript comes
back. A board that sits in a disabled person's home has to be unambiguous about
when it is listening, which is also why this is a separate mode rather than a
corner of the describe screen.

Echo cancellation is on, because the board speaks out loud and would otherwise
hear its own voice and generate replies to itself.

## Speech

Board buttons speak through **Deepgram Aura-2**, with **Nova-3** for the
microphone. The key never reaches the browser.

**The country question picks an accent, not a language.** Aura's non-English
models are trained on their own language, so feeding English board words to a
Dutch model would mangle them. Deepgram ships five English accents — American,
British, Australian, Filipino on Aura-2, and Irish only on Aura 1's
`aura-angus-en` — so countries are grouped rather than mapped one by one, and
everything outside a group falls to British, which is the English most of the
world is taught. The fallback is stated to the caregiver rather than hidden.
Irish has exactly one voice and it is male; a girl or woman set to Irish gets the
British female instead, and is told why.

**Raw PCM rather than MP3.** Aura leaves almost no silence after the last sound —
"wash" ends 18ms after the final "sh" — and an MP3 frame is over 50ms, so a
browser decoder drops the tail and the word comes out as "wa". Asking for
`linear16` and assembling the WAV on the server means the bytes are exact and a
pad can be appended.

**Clips are levelled, not just trimmed.** Aura's output level tracks how much
there is to say: "stop" comes back nearly six times louder than "you", so the
function words a board leans on hardest were the ones nobody could hear. Every
clip is brought to a fixed RMS, capped so a near-silent render is not magnified
into hiss.

**A one-word clip keeps only its loudest run.** Aura-2 sometimes emits a short
artifact either side of a single word, separated by a clear gap: "in" came back as
a blip, 160ms of silence, then "in", which plays as "in-in". Trimming from the
outermost audible sample cannot fix that, because the artifact is audible. The
clip is split on any silence longer than a stop closure and only the loudest run
survives. A whole sentence is trimmed normally instead, since a sentence is
legitimately several runs with real pauses between them.

**A sentence is one Deepgram call, not a queue of words.** Punctuation is the
prosody lever Aura exposes, and a terminal question mark is what makes a question
sound like one. Words are still cached individually, so "I want more" and "I want
help" share everything but the last word.

**Speech is cached by text, voice and model,** because an AAC communicator presses
the same button dozens of times a day. A clip that came back inaudible is refused
rather than cached, since caching one turns a bad render into a permanently dead
button.

## The research behind it

Almost nothing here is invented. The field has published most of these answers
already, and the interesting part was finding out which of our instincts the
evidence contradicted.

**Why most of the board is static.** The best-replicated finding in AAC is that a
small set of words does most of the work: roughly fifty words cover 40 to 50 per
cent of daily communication, a hundred cover about 60, and two to four hundred
cover about 80. It holds across ages, populations and settings — Banajee, DiCarlo
and Buras Stricklin (2003) on toddlers, Beukelman et al. (1984, 1989), Balandin
and Iacono (1998, 1999) on workplace conversation, Deckers et al. (2017) on Down
syndrome. If a handful of words carry most of what someone says, those words
should be in the same place every single time, because that is what lets a
communicator reach them without looking. Moving them to be clever would cost more
than the cleverness is worth.

**Which core words.** The fixed pages carry all thirty-six words of the
**Universal Core vocabulary** from the Center for Literacy and Disability Studies
at UNC Chapel Hill, which is published CC BY 4.0 and free to use commercially with
attribution. We added yes, no, again, wait, eat, drink, play, sleep, wash, please,
thank you, sorry and my turn on top of it.

**Why the colours work the way they do.** Light, Wilkinson, Thiessen, Beukelman
and Fried-Oken (2019) review the eye-tracking programme behind display design, and
two findings shaped this board directly. Clustering symbols by their internal
colour makes target search significantly faster than distributing them
(Wilkinson et al., 2008), which is why like-coloured words sit together rather
than being scattered. And background colour cues do **not** help on small displays
— no measurable effect on time-to-fixate or response — so we colour the symbol,
not the cell, and every tile carries the same single subtle border. Spatial
grouping beats plain row-and-column order (Wilkinson et al., 2017), which is why
folders sit beside the words they extend rather than being gathered into a corner.
Wilkinson, Zimmerman and Light (2021), across fifty-five participants spanning
autism, Down syndrome, intellectual disability and typical development, found that
a persistent navigation bar earns its visual cost, which is why back, next, yes
and no keep reserved cells on every screen.

**Why the layout adapts at all.** This is the finding that justifies the whole
project. AAC vocabulary is organised taxonomically (People, Places, Things),
schematically (by event: "at the park", "bath time"), semantically, or as visual
scenes. The evidence favours **schematic** organisation, especially for young
children: Drager et al. (2003) found children located more vocabulary in an
integrated-scene condition than in a taxonomic grid; Lucariello et al. (1992)
found four-year-olds rely primarily on schematic knowledge, with conventional
category use developing around seven. Most shipping AAC apps are taxonomic, which
is the scheme the research says works worst for exactly the children who need it
most. A board for "at the park" is textbook schematic organisation. We are not
inventing a scheme — we are automating the one the field already prefers, which
until now had to be hand-built per activity by a caregiver or a speech and
language therapist.

**Why symbols need a caregiver's eye.** Díez et al. (2024) published transparency
and translucency norms for 1,525 ARASAAC pictograms rated by 521 participants.
Mean transparency was low (0.39) but translucency high (6.33): symbols are mostly
*not* guessable cold, but make sense once explained. More pointedly, there was a
53.2 per cent discrepancy between the names participants gave a pictogram and its
official ARASAAC label. Half the time the label does not match what people
actually see, which is why confidence scoring exists and why anything below the
threshold goes to the caregiver rather than being placed silently.

**Why conversation mode always offers a refusal.** Valencia et al. (CHI 2023)
found AAC users want speed but raise serious concerns about loss of voice and
agency when a model puts words in their mouth. Mao, Lee, Faroqi-Shah and Valencia
(2025) found that AI-generated errors are more damaging than a user's own errors,
and that trust depends on accurate intent recognition *plus* flexible user
control. That is the entire argument for generating the words but freezing the
positions, and for guaranteeing that "no" is always reachable in the same place.

## Where this is new

Context-aware AAC is not a new idea, but nobody has shipped it.

Kane, Linam-Church, Althoff and McCall built **TalkAbout** in 2012 (ASSETS), an
AAC tool for people with aphasia that organised vocabulary by location and by
conversation partner instead of by topic hierarchy. It was a research prototype:
five participants, six weeks, no rigorous comparison against non-adaptive AAC. That
gap sat open for fourteen years.

It closed in January 2026. Griffen, Raley, Holyfield, MacNeil, Lorah and Burns
published an ABAB reversal study in the *Journal of Special Education Technology*
on context-aware AAC generating response options from communication-partner input,
with three autistic preschoolers. All participants communicated more frequently,
more accurately and faster. That is the study conversation mode implements.

So the shape of our claim is narrow and, we think, true: context-aware AAC was
prototyped in 2012, first shown to work in a controlled design eight months ago,
and no commercial product does it. Proloquo2Go costs $249.99 largely because of
proprietary symbol licensing (SymbolStix, PCS) and licensed voices paid per
install — a structural cost, not a research moat. Building on openly licensed
symbols removes the largest recurring cost line, which is the honest answer to why
nobody has done this cheaper.

The second thing we think is new is adapting to the **disability** and not only
the situation. Setup measures tap accuracy and asks about eyesight and colour
vision separately, and those answers change button size, spacing, palette and
contrast before the communicator presses anything. Most AAC apps ship one board
and leave that tuning to a therapist.

Full notes, with links to every paper, are in `claude/aac-research-evidence-base.md`.

## Accessibility

- Setup asks one question per page. A caregiver who is not especially technical
  should never have to work out which of four fields still needs an answer.
- The tap calibration sets the spacing between buttons as well as their size. For
  someone with a tremor the gap prevents mis-taps as much as the size does.
- Every press is debounced, so one intended tap cannot say a word twice.
- Buttons are colour-coded by word type, following the Fitzgerald key. Colour is
  never the only signal: every button always shows its word.
- Setup asks about colour vision as well as eyesight. Red and green looking alike
  is exactly the pair yes and no rely on, so the palette changes rather than the
  layout. Under CVI and low vision the board goes plain and high-contrast, with
  fewer buttons and wider spacing, rather than just larger text.
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

## Not built yet

- **Real location detection.** The location context is built and visible through
  the demo controls; what is missing is reading it from the device rather than
  being told.
- **An accent picker in Settings.** `resolveVoice` already accepts an
  `accentOverride` and `ACCENTS` is exported for exactly this, but nothing sets
  it, so the only lever on the accent today is the nationality answer.
- **HEIC uploads.** A photo picked on an iPad often arrives labelled `image/jpeg`
  while the bytes are HEIC, which passes the content-type check, stores fine, and
  then shows as nothing at all because a browser cannot decode it. The upload
  route should sniff the magic bytes and say so.
- **Dropping words that stop being pressed.** Adding a word already teaches it
  where it belongs; the other half needs the press history to mean something,
  which it now has.
- **A therapist review of the starter vocabulary.**

## Deployment

Live at **<https://talkalotta-production.up.railway.app/board>**, on Railway.

The database is a SQLite file and it always lives in `./data` — only the filename
is configurable, through `DATABASE_FILE`, which keeps the path statically scoped
so the bundler does not trace the whole project into the server output. That means
a host needs a real filesystem that survives a restart: Railway has a volume
mounted at `/app/data`, and a serverless deploy would start empty on every cold
start. Everything goes through `lib/db/index.ts`, so moving to a networked SQLite
such as Turso is a change to that one file.

Tables are created and migrated on first use, so a fresh deployment needs no
migration step.

## Picture credits, and one licensing catch

Pictures come mostly from ARASAAC, with OpenSymbols libraries including Mulberry
and Tawasol as a fallback. Licence and author are recorded with every picture.

The catch: **ARASAAC pictograms are CC BY-NC-SA, which is non-commercial.** That
is fine for a hackathon and it needs attribution, but because ARASAAC is the
primary source, most of the board carries a non-commercial licence. The route to a
commercial release is Mulberry, which is CC BY-SA and already reachable through
the OpenSymbols client: reorder `SOURCE_TRUST` in `lib/symbol-search.ts` to put
`mulberry` first.

## A note on our own keys

`.env` is gitignored, and the keys listed at the top of this file are the ones it
holds. Several of ours have been pasted into chat transcripts at some point during
the build, so we are treating them as exposed and rotating them after the event.
If you are running your own copy, get your own from the links above — none of ours
are in this repository.
