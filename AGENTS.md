# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Copilot, Cursor, ...) working in this repository.

## What this is

A personal finance app (allowance, lunch money, fixed costs, budgets, savings account) with a ChatGPT-style chat as the main input. It is an offline Angular 21 PWA with no backend: all data lives in `localStorage` on the device and moves between iPhone and Mac via JSON export/import. Bank transactions can be imported from a George (Erste Bank / Sparkasse) CSV export, parsed entirely in the browser.

UI text, chat commands, code comments, commit messages and the changelog are in German. Keep it that way.

## Commands

```bash
npm install                                          # .npmrc sets legacy-peer-deps, keep it
npm start                                            # dev server, http://localhost:4200
npx ng build                                         # production build -> dist/finanzen-app/browser
npx ng test --watch=false                            # all unit tests (Vitest via @angular/build:unit-test, jsdom)
npx ng test --watch=false --include src/app/parser.spec.ts   # a single spec file
npx prettier --write src                             # format (printWidth 100, single quotes)
```

There is no linter. Run the full test suite before every push; CI runs the same command.

## Architecture

Everything is in `src/app/`, one standalone component plus plain-TypeScript logic modules:

- `models.ts`: data model and defaults. `AppData` holds global `Settings` and a list of `Month`s. Each `Month` snapshots allowance, lunch rate, school days, fixed costs and budgets from `Settings` when it is created, so changing settings does not rewrite past months. Each month owns its own `entries` and `chat` history.
- `parser.ts`: pure, rule-based German natural-language parser (no AI, no network). `parseMessage` turns one chat line into a `ParseResult` discriminated union (entry, skipLunch, setting, question, editLast, deleteMatch, undo, help, ...); `parseMessages` splits on `,` / `und` / newlines and falls back to one entry if any part isn't understood. Handles typos, number words ("zehn euro"), relative dates ("gestern", "am montag", "vor 3 tagen"), category keywords and fuel vouchers. `HELP_TEXT` is the in-app help, and the README table documents the same commands.
- `budget.ts`: pure calculations on a `Month` / `AppData` (`summarize`, `tips`, `goals`, `dailyFood`, `history`, `totalSavings`, ...). Clothes and haircut count against the `misc` budget.
- `george.ts`: George CSV import (UTF-16 LE decoding, CSV parsing, merchant shortening, categorisation, duplicate detection, settings suggestions for first-start setup). Pure functions; the component drives the import dialog.
- `store.ts`: the single injectable `Store`. State is one `signal<AppData>`; derived views are `computed`s over `budget.ts`; an `effect` persists to `localStorage` (key `finanzen-app-data`) on every change. `send(text)` is the chat entry point: parse, `apply` each result, build the German reply with chips. Also JSON export/import and first-start setup.
- `app.ts` / `app.html`: the only component (tabs, chat, calendar, stats, settings, import). Registers the service worker update check (`SwUpdate`).
- `version.ts`: `VERSION` comes from `package.json`; `RELEASES` is the in-app "what's new" list.

Parser, budget and George logic are pure functions taking an explicit `today` date where relevant; that is how the specs test them. Put new logic there, not in the component, and add a spec for it.

## Rules that are easy to break

- **Saved data must keep loading.** Real data sits in the owner's browser and in exported JSON files. `load()` and `importJson()` only merge `DEFAULT_SETTINGS` over stored settings, there is no migration step. New fields on `Settings` must be optional or have a default; never rename or remove existing fields of `AppData`, `Month` or `Entry`.
- **No default values.** `DEFAULT_SETTINGS` is all zeros and empty on purpose. A budget of `0` means "no budget": no warnings, goal hidden. Don't add personal numbers as defaults.
- **Bank data privacy.** Never commit bank exports (`*.csv`, `*.xls*` are gitignored). Tests use synthetic rows only. The import stores only date, amount, merchant, category and a hash per transaction, never IBANs or raw rows; the owner's own name is guessed per import and never stored; notes contain first names only.
- **No server.** Don't add a backend, external API calls or tracking. The app must work offline after the first load.

## Releasing

Every push to `main` runs `.github/workflows/`: tests, builds with `--base-href /finanzen-app/`, deploys straight to GitHub Pages (https://gigafrosxh.github.io/finanzen-app/) and creates a GitHub release `vX.Y.Z`. The owner's iPhone picks up the new version on next open, so a push to `main` is a production release. Work on a branch unless told otherwise.

Any user-visible change needs a version bump in three places that must agree, or CI fails:
1. `version` in `package.json` (semver: new feature = minor, fix = patch),
2. a `## X.Y.Z (DD.MM.YYYY)` section in `CHANGELOG.md` (checked by the workflow),
3. a new first entry in `RELEASES` in `src/app/version.ts` (checked by `version.spec.ts`, newest first).

Changelog entries are short German sentences written for the app's user, not for developers. Docs-only or CI-only changes need no bump.
