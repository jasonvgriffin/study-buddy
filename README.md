# Study Buddy

Your PDFs, as flashcards. Study Buddy reads a PDF you upload, splits it into tests, and quizzes you from that text. It does not generate questions, rewrite them, or download a question bank.

Cards, answers, and paused sessions stay in IndexedDB on this device.

## Run locally

```bash
npm install
npm run samples
npm run dev
```

The dev server listens on port 43123. Open [http://127.0.0.1:43123/study-buddy/](http://127.0.0.1:43123/study-buddy/).

```bash
npm test
npm run build
```

`npm run test:e2e` runs Playwright against a mobile viewport. It uses Chromium unless you point Playwright at a Brave install yourself.

## How a PDF becomes cards

1. Create a subject. A subject is one exam you study over time. Nothing about a particular certification is built in.
2. Upload a text PDF into that subject. Study Buddy saves every test it finds, using the names in the file (or the file name, or Test 1, when a name is missing). Each upload is its own group of decks.
3. Start studying. The first test in that file is ready immediately. Organize tests (rename, merge, split, or reorder) is optional, from the link under Start studying or later in the library.
4. Each test is one deck. A practice exam or a missed-card drill uses exactly one test. A due-card review can span tests when you filter by subject or domain.

Supported layouts include `Q:` / `A:`, numbered questions, multiple choice with an answer key, and lettered exams that have a quick-answer grid plus a detailed answer (including “choose two”). If the PDF has no explanation for a card, the study screen says exactly: No explanation provided in your PDF.

Scanned pages are not read. Study Buddy does not OCR.

## Study

- Home leads with Continue, or Start studying when a test is already saved. With nothing saved, the first step is Start a new subject: name it, then import that subject's PDF. After the PDF is read, Home shows a full-width Start studying button for the first test in that file. Organize tests is a small link there and in the library. That same card carries today when there is something to show: a one-line summary under Continue if a session is still open, or the day's counts, I don't know, each subject and test, and the streak under Start studying when nothing is in progress. An empty day adds no today text. The rest is grouped: Study (practice exam, drill, Recommended Cards), Library (decks, import), a Stats button that opens the Stats screen, and Settings and backup.
- Untimed mode, or a 90-minute exam. The clock stores active time only. Pause, or leave the tab, and it stops. Hiding the page does not add the time you were away. Skip for later does not stop a timed exam.
- Skip for later leaves the question unanswered and moves on. Skipped questions stay on that sitting through pause and refresh. At the end, a review list lets you jump back to each one. End session on that list leaves the rest unanswered. Until you answer them they count as unanswered, not right or wrong, and they are not treated as a miss on the review ladder.
- “I don't know” on a question shows the correct answer and explanation, including the lesson link when the card has one, counts the question as missed, and then lets you go on to the next question. A sitting finishes when the last question is answered or the 90 minutes run out. See results is there then. Pause and Resume stay on the question.
- The header reads Question 12 of 90, with a bar for how far you are.
- Open a test in the library to edit a card’s explanation, section, or lesson link. A sitting does not have an edit button.
- Settings has a text size: small, normal, large, or extra large. It stays on this device after a refresh. Buttons are sized for a phone.
- Answer choices are mixed each time a question is shown. The correct letter stays on its text. Options such as All of the above or Both A and B stay in place. Turn this off under Settings. The choice is remembered on this device.
- On a desktop keyboard, 1–9 or A–D (and further letters) pick an answer. Choose-N toggles until Enter or Space submits. Enter or Space also moves to the next card. S skips, unless that letter is one of the answers. A short hint is shown on desktop only.
- At the end of a sitting, missed questions list your answer, the right answer, and the explanation, with a link that opens that card in the test.
- Results and Stats break the score down by the domain and objective already stored on each card.
- After you have answered a card, if you have not exported a backup in 7 days, a banner offers Export backup. Dismiss hides it for 7 days.
- Buttons and answer choices press in: the color shifts and the control scales down briefly. Phones that support vibration (Android Chrome and Brave) also get a short tap. A wrong answer shakes the choice, shows Incorrect with an ✗, and uses a double vibration. A correct answer shows Correct with a ✓ and a single tap. Settings can turn haptics off (they start on) or turn sounds on (they start off). Sounds are short tones made in the browser, with no audio files. iOS has no vibration API, so it uses one system tap when the phone allows it, and the press animation either way.
- Each multiple-choice option is a button. Tap one to grade it. The choice you picked turns green or red, and the correct choice is highlighted. On a choose-two or choose-N question, tap to toggle selections, then Submit once that many are selected. The explanation, or the line “No explanation provided in your PDF.”, shows under the answers with no extra tap, then Next. A card with no options still asks you to mark it yourself.
- The running score is on screen the whole time. At the end you get the percent, right, wrong, and unanswered counts, active time, and a comparison with earlier finished attempts on that same test.
- A wrong answer in a drill or review comes back later in that sitting, and it is due again immediately. Correct answers move out on a 1 day, 3 day, 7 day, 16 day ladder, then grow by 2.2×. A skip does not.
- “What to study next” ranks your own section, domain, and objective labels. Recent answers count more than old ones. Under about 70% (with at least four answers) is called out. A suggestion that belongs to one test starts a drill of that test only.

“Watch the lesson” appears under the explanation after you answer, and only when the card has a link. It is the same underlined link on the answer and in the missed-question review. It opens in a new tab. If `src/data/lesson-links.json` has a verified YouTube id for that PDF link, the link opens the video. Otherwise it opens the URL that was printed in the PDF. A start time is added only when you set one, or when the map includes `startSeconds` from a verified chapter. The app does not invent timestamps.

## Persistence

Progress is written after every answer and every edit. On launch, a session that was still marked running is treated as paused, and only the time up to the last save is kept.

Ask the browser to persist storage from Settings. Also export a JSON backup. Import replaces what is currently on this device.

`file://` will not keep IndexedDB reliably on a phone. Use the dev server or an HTTPS host.

## Using on Brave (mobile)

1. Open the site URL in Brave (the GitHub Pages address, or your dev machine’s URL if the phone can reach it).
2. Add it to the home screen from Brave’s menu.
3. If the page is blocked, tap the Brave lion and turn Shields down for this site only.
4. Clearing site data, or studying in a private tab, erases decks and history. Export a backup first.

Study Buddy does not load analytics, cookie banners, third-party fonts, or a CDN. The PDF worker is bundled with the app.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds on every push to `main` and deploys with GitHub Actions.

1. Push this project to a repository on github.com.
2. In the repository, open Settings → Pages and set the source to GitHub Actions.
3. The next run of “Deploy to GitHub Pages” publishes the site at `https://<user>.github.io/<repo>/`.

The published site is [https://jasonvgriffin.github.io/study-buddy/](https://jasonvgriffin.github.io/study-buddy/). The Vite `base` defaults to `/study-buddy/`, so scripts, icons, the manifest, and sample PDFs load under that path. Override it with the `VITE_BASE` environment variable (or the GitHub Actions repository variable of the same name). Use `/` for a domain root, or `./` for a relative build.

Routes are hashes, so a deck or a session survives a refresh and a shared link:

- [https://jasonvgriffin.github.io/study-buddy/#/](https://jasonvgriffin.github.io/study-buddy/#/)
- [https://jasonvgriffin.github.io/study-buddy/#/stats](https://jasonvgriffin.github.io/study-buddy/#/stats)
- [https://jasonvgriffin.github.io/study-buddy/#/settings](https://jasonvgriffin.github.io/study-buddy/#/settings)

GitHub Pages does not need a single-page fallback for those hash URLs.

Any other static HTTPS host works the same way: `npm run build` and upload `dist/`.

## YouTube lesson map

`src/data/lesson-links.json` maps a PDF link to a verified YouTube id. It is filled at build time, never while you are studying:

```bash
node scripts/resolve-lessons.mjs path/to/your.pdf
```

The script reads `professormesser.link` URLs from that PDF, follows them, and keeps an id only when the lesson page embeds a YouTube video whose oEmbed author is Professor Messer. It stores the id and title, not book text. If a host blocks the fetch, the file stays empty and the watch link falls back to the PDF URL. You can edit a card’s link and optional start time in review.

## Sample PDFs

`npm run samples` writes synthetic PDFs under `public/samples/` for tests. The app does not offer a button to load them. Upload a PDF from the library after you name a subject.

## Project layout

- `src/lib/parser.ts` — text to tests, domains, objectives, explanations, links
- `src/lib/pdfExtract.ts` — pdf.js in the browser, worker bundled locally
- `src/lib/scoring.ts` — memory schedule, drill order, recommendations
- `src/lib/session.ts` — one sitting: timer, pause, exam, drill, review
- `src/lib/db.ts` — IndexedDB
- `src/Home.tsx`, `Review.tsx`, `Deck.tsx`, `Session.tsx`, `Stats.tsx`, `Settings.tsx` — the screens
- `tests/real-pdf.test.ts` — runs only when a local PDF is present under `uploads/` (that folder is gitignored)

## Limitations

- No OCR, so a scan of a book will not produce cards.
- No generated or reworded questions. If the parser misses a layout, Organize tests is where you fix the split.
- Lesson video ids are only as complete as the committed map.
- Private windows and cleared site data remove the local database.
