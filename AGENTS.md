# AGENTS.md

## What this is

Study Buddy turns PDFs into flashcards and quizzes from the PDF's own text. React 19 + TypeScript + Vite + Tailwind. Data stays in IndexedDB on the device. It's built mainly for phones and deployed to GitHub Pages at https://jasonvgriffin.github.io/study-buddy/.

## Commands

Use Node 22 (what CI uses). Under Node 20, `npm test` fails in `src/lib/pdfFigures.test.ts` with `Promise.withResolvers is not a function` (pdf.js needs Node 22+).

| Task | Command |
| --- | --- |
| Install | `npm ci` (plus `npx playwright install --with-deps chromium` for e2e) |
| Dev server | `npm run dev` (http://127.0.0.1:43123/study-buddy/) |
| Unit tests (vitest) | `npm test` |
| Build (`tsc -b && vite build`) | `npm run build` (outputs `dist/`) |
| Lint | `npm run lint` |
| E2E, mobile Chromium | `npx playwright test --project=chromium-mobile` |
| E2E, all projects | `npm run test:e2e` (also needs Firefox and WebKit installed) |
| Regenerate sample PDFs | `npm run samples` (writes `public/samples/`, which is committed) |

Playwright starts its own dev server on port 43124. The e2e specs upload the committed PDFs in `public/samples/`. `tests/real-pdf.test.ts` only runs when a local PDF exists under `uploads/` (gitignored, never commit it).

## Screenshots

Take them at phone size with Playwright. Some specs already save shots to `$E2E_SHOTS` (default `test-results/shots/`):

```bash
E2E_SHOTS=artifacts npx playwright test --project=chromium-mobile
```

For a one-off shot, use a throwaway script (don't commit it) with `devices['Pixel 7']` (412x915) against `http://127.0.0.1:43123/study-buddy/` and `page.screenshot({ path: 'artifacts/<name>.png', fullPage: true })`. Save report screenshots to `artifacts/` (on Cursor Cloud, `/opt/cursor/artifacts/`) and don't commit them.

## Deploy flow

`.github/workflows/deploy.yml` runs on every push to `main`: `npm ci`, `npm test`, `npm run build`, then deploys `dist/` to GitHub Pages. Merging to `main` deploys to production, and there is no other release step. The Vite `base` defaults to `/study-buddy/`. The `VITE_BASE` env var or repo variable overrides it.

## Conventions

- One branch and one PR per task.
- Run `npm test` and `npm run build` (and the mobile Chromium e2e when UI changes) before opening the PR.
- Never merge your own PR. Jason reviews and merges.
- Include phone-size screenshots of any visible change in the PR or report.
- Write summaries in plain language: what changed and how to see it.
- Don't add analytics, CDNs, third-party fonts, or generated questions (see README).

## Cursor Cloud specific instructions

- The environment install (`.cursor/environment.json`) runs `npm ci && npx playwright install --with-deps chromium`. Rerun `npm ci` if `package-lock.json` changes on your branch.
- A "Vite dev server" terminal runs `npm run dev -- --host 127.0.0.1` on port 43123. Playwright uses its own server on 43124, so the two don't collide.
- Only Chromium is installed, so run e2e with `--project=chromium-mobile` (or `chromium-desktop`). Install Firefox or WebKit with `npx playwright install --with-deps firefox webkit` only if the task needs them.
- Put screenshots for the report in `/opt/cursor/artifacts/`.

## Lessons
Before building anything, read LESSONS.md and follow it.

**Before opening or updating a PR, add anything new you learned in this run to `LESSONS.md`, even if nobody asked:** app-specific lessons under the app section, reusable ones under General lessons. Also list them under a `Lessons learned` heading in the PR description so Eve can copy the general ones to the other repos and the shared skill.
