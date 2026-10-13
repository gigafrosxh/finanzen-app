# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal finance app (allowance, lunch money, fixed costs, budgets, savings account) with a ChatGPT-style chat as the main input. It is an offline Angular 21 PWA with no backend: all data lives in `localStorage` on the device and moves between iPhone and Mac via JSON export/import. UI text, chat commands, code comments, commit messages and the changelog are in German.

## Commands

```bash
npm install
npm start                                            # dev server, http://localhost:4200
npx ng build                                         # production build -> dist/finanzen-app/browser
npx ng test --watch=false                            # all unit tests (Vitest via @angular/build:unit-test, jsdom)
npx ng test --watch=false --include src/app/parser.spec.ts   # a single spec file
npx prettier --write src                             # format (printWidth 100, single quotes)
```

There is no linter configured.

## Architecture

Everything is in `src/app/`, one standalone component plus plain-TypeScript logic modules:

- `models.ts`: data model and defaults. `AppData` holds global `Settings` and a list of `Month`s. Each `Month` snapshots allowance, lunch rate, school days, fixed costs and budgets from `Settings` when it is created (`Store.createMonth`), so changing settings does not rewrite past months. Each month also owns its own `entries` and `chat` history.
- `parser.ts`: pure, rule-based German natural-language parser (no AI/network). `parseMessage` turns one chat line into a `ParseResult` discriminated union (entry, skipLunch, setting, question, editLast, deleteMatch, undo, help, ...); `parseMessages` splits a message on `,` / `und` / newlines into several entries and falls back to one entry if any part isn't understood. Handles typos, number words ("zehn euro", "ein fünfer"), relative dates ("gestern", "am montag", "vor 3 tagen"), category keywords, and fuel vouchers (only the self-paid part counts). `HELP_TEXT` is the in-app help.
- `budget.ts`: pure calculations on a `Month`/`AppData` (`summarize`, `tips`, `goals`, `dailyFood`, `history`, `totalSavings`, ...). Clothes and haircut expenses count against the `misc` budget.
- `store.ts`: the single injectable `Store`. State is one `signal<AppData>`; derived views are `computed`s over `budget.ts`; an `effect` persists to `localStorage` (key `finanzen-app-data`) on every change. `send(text)` is the chat entry point: parse, `apply` each result to the state, and build the German reply with chips. Also export/import JSON.
- `app.ts` / `app.html`: the only component (tabs, chat, calendar, stats, settings). Registers the service worker update check (`SwUpdate`).
- `version.ts`: `VERSION` comes from `package.json`; `RELEASES` is the in-app "what's new" list.

Parser and budget logic are pure functions taking an explicit `today` date, which is how the specs test them; prefer keeping new logic there rather than in the component.

## Releasing

Every push to `main` runs `.github/workflows/` which tests, builds with `--base-href /finanzen-app/`, deploys to GitHub Pages (`gh-pages` branch, https://gigafrosxh.github.io/finanzen-app/) and creates a GitHub release `vX.Y.Z`.

Any user-visible change needs a version bump in three places that must agree, or CI fails:
1. `version` in `package.json` (semver: new feature = minor, fix = patch),
2. a `## X.Y.Z (DD.MM.YYYY)` section in `CHANGELOG.md` (checked by the workflow),
3. a new first entry in `RELEASES` in `src/app/version.ts` (checked by `version.spec.ts`, newest first).
