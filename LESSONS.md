# LESSONS.md: study-buddy

Read this before any change. Add a dated one-line rule when a review or bug teaches one. App-specific lessons go in the first section; lessons that apply to any app go under General lessons (mention them in your PR so Eve syncs her shared skill).

## App-specific lessons

(none yet)

## General lessons (from Eve's shared app-build-lessons skill; Eve keeps this section in sync)

### Build workflow
- **Build workflow (Compound Engineering plugin, installed Oct 2026):** run each build as plan, then work, then code review, then compound. Use `ce-plan` to turn the change list into a plan with a yes/no done checklist, `ce-work` for the coding agent, `ce-code-review` on the PR before merge, and `ce-compound` after release to record learnings. If cloud agents can't see the plugin, write these steps into the repo's `AGENTS.md`. Source: https://github.com/EveryInc/compound-engineering-plugin
- Two standing rules (originally from the Superpowers plugin, uninstalled Oct 4 2026; follow them anyway): `verification-before-completion` (run the checks and show the evidence before saying anything is done or fixed) and `test-driven-development` for bug fixes (write a failing test for the bug first, then fix it). Compound Engineering is the only build workflow plugin.


### Verification
- Verify UI from real renders or screenshots at a small width (360dp) and a default width, never from layout math. Reviewers sign off only from screenshots. (Recipe app 1.0.8: labels passed the math but were truncated on the phone.)
- Include reviewer checklists in the build prompt up front, so one agent run is enough and no fix-up run is needed.

### Layout
- Text never truncates: shrink-to-fit plus removing padding come before shortening labels.
- Every text input needs keyboard avoidance, tested with the keyboard open (Android: softwareKeyboardLayoutMode resize).
- Editing one field must not hide nearby controls.
- Respect safe-area insets on all edges.

### Theme and color
- Never hard-code colors. Use theme tokens, and accent-tinted UI follows the user's chosen accent.
- Content on an accent fill uses a per-accent on-color (dark text on light accents such as amber or lime).
- Status colors (badges, destructive actions) are fixed, not accent-driven.
- If light and dark modes should match, use one shade per color that meets about 3:1 contrast on both backgrounds.

### Process and usage
- Batch requests into fewer, larger versions. Each build plus review costs real usage.
- Group chats wake every member on every message. Keep specialist bots out of busy rooms and message them directly at checkpoints.
- Make sure one release event builds once (concurrency group, skip CI on docs-only commits).
- Verify the release yourself: the run succeeded, the asset is attached, the version is correct and it's signed with the same cert.
