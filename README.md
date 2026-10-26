# Dosely

An Expo / React Native app for tracking medications, dose schedules, and drug interactions across multiple profiles (e.g. yourself and a kid).

## Features

- **Multiple profiles** — medications and schedules are tracked per profile.
- **Dose scheduling** — generates and syncs upcoming doses, including PRN (as-needed) medications, with local push notifications and follow-up "still haven't taken this?" reminders.
- **Drug interaction checks** — looks up FDA label data (via openFDA/RxNorm/PubChem) to flag potential interactions between a profile's medications, with results cached per pair.
- **Plain-language drug info** — simplifies FDA label text into everyday language, optionally upgraded with a Google Gemini rewrite if an API key is configured.
- **Streaks & history** — tracks adherence over time.
- **PDF export** — share a profile's medication list/history.

## Tech stack

- [Expo](https://docs.expo.dev/) + [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing, see `app/`)
- React Native + TypeScript
- `expo-sqlite` for local storage (schema in `db/schema.ts`)
- `expo-notifications` for local reminders
- React Native Paper for UI components

## Getting started

```bash
npm install
npm start
```

Then press `i` / `a` / `w` in the Expo CLI (or scan the QR code with Expo Go) to run on iOS, Android, or web.

### Environment variables

Copy `.env.example` into `secrets/.env` (gitignored) and fill in real values. The project root's `.env` is a symlink to `secrets/.env`, which is what Expo actually reads.

| Variable | Required | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_GEMINI_API_KEY` | No | Google Gemini free-tier key used to rewrite confirmed drug-interaction/label text into plain language. The app works without it and falls back to deterministic text cleanup — see `lib/geminiClient.ts`. |

## Project structure

```
app/                Expo Router screens (tabs, medications, profiles, drug-info)
assets/             App icons, splash screen, and favicon
components/         Shared UI components (forms, notification responder)
db/                 SQLite schema, queries, and types
lib/                Business logic: scheduling, notifications, interaction checks,
                    drug info lookups/caching, PDF export, theming
secrets/            Gitignored directory holding the real .env file
.env                Symlink to secrets/.env (what Expo actually reads)
.env.example        Template listing the environment variables the app accepts
.gitignore          Files and folders excluded from git
app.json            Expo app configuration (name, icons, plugins, etc.)
expo-env.d.ts       TypeScript environment types for Expo
LICENSE             Project license
package.json        Dependencies and npm scripts
package-lock.json   Locked dependency versions
README.md           This file
tsconfig.json       TypeScript compiler configuration
```

## Notes

- Expo's API has changed significantly across versions — check the versioned docs for the Expo version actually pinned in `package.json` before making changes.
