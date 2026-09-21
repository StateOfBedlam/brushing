# Brushing Tracker — v1 Proposal

A personal iPhone PWA for self-reporting tooth brushing and flossing, with a daily streak. Built tonight as a first draft. Must be updatable forever without ever losing data.

## Goals for v1 (tonight)

1. Log a **Morning Brush** or **Night Brush** for a given day, with an optional **flossed** checkbox on the brush.
2. Log **Flossing** as its own standalone event (less common path).
3. Show a **current streak**: consecutive days with at least one brush (morning OR night).
4. Let me explicitly mark a day as **Missed**, which ends the streak.
5. Keep a **history of ended streaks** (start date, end date, length) and show my **best streak**.
6. Show a simple day-by-day history: for each day, Morning ✓/✗, Night ✓/✗, Floss ✓/✗, or Missed.
7. **Export** all data as a JSON file, and **Import** from one.

## Out of scope for v1

Reminder notifications, syncing to Mac or GitHub, toothpaste/toothbrush tracking UI, RPG/gamification. The data schema should leave room for these without migrations being painful.

## Core design principle: the log is the source of truth

Do not store the streak as a number. Store an append-only list of events, and **derive** the streak, streak history, and day statuses from it every time. (Like a bank balance being computed from the transaction history rather than typed in.) This means backfilling a forgotten entry just recalculates everything correctly.

## Day rules

- I choose which day an entry counts for. Default to today; allow picking a past date. No hard time boundary. Morning = "after sleep", Night = "before sleep", my judgement.
- A day's status is one of:
  - **Brushed**: has at least one morning or night brush.
  - **Missed**: I explicitly marked it missed (and it has no brush).
  - **Unresolved**: in the past, no brush, not marked missed.
  - **Today, pending**: today with no brush yet. Never counts as a miss.
- **Unresolved days do not silently break the streak.** When the app opens and there are unresolved past days (since the first-ever entry), show a prompt for each: "Did you brush on <date>?" with **[Log a brush]** and **[I missed it]**. The current streak is shown as "on hold" until they're resolved.
- If I add a brush to a day already marked Missed, ask to confirm, then remove the Missed marker.

## Streak rules

- Current streak = count of consecutive Brushed days ending at today (if today is brushed) or yesterday (if today is pending).
- A Missed day ends a streak. The ended streak (start, end, length) appears in streak history. Streaks of length 0 aren't listed.
- Best streak = longest streak ever, including the current one.
- All of this is computed, never stored.

## Data model

All data lives in one object in `localStorage` under a single key (e.g. `brushtracker:data`):

```json
{
  "schemaVersion": 1,
  "events": [
    {
      "id": "uuid",
      "type": "brush",
      "slot": "night",
      "date": "2026-09-20",
      "loggedAt": "2026-09-21T00:34:12-07:00",
      "flossed": true,
      "note": ""
    },
    {
      "id": "uuid",
      "type": "floss",
      "date": "2026-09-20",
      "loggedAt": "2026-09-20T14:02:00-07:00",
      "note": ""
    },
    {
      "id": "uuid",
      "type": "miss",
      "date": "2026-09-18",
      "loggedAt": "2026-09-19T08:10:00-07:00"
    }
  ]
}
```

- `date` is the day the entry counts for (local date, `YYYY-MM-DD`). `loggedAt` is when I actually entered it.
- Reserve optional fields for later (don't build UI yet): `toothpaste`, `toothbrush` on brush events.
- Deleting an entry is allowed (with a confirm), for fixing mistakes.

## Data safety (non-negotiable)

- `schemaVersion` on the data. On load, run migrations from older versions up to current. Never discard unknown fields.
- Read/write wrapped in try/catch. If stored data fails to parse, **do not overwrite it**. Show an error and offer export of the raw string.
- Export: download a JSON file named like `brushtracker-backup-2026-09-20.json`. Import: validate, show a summary (event count, date range), confirm, then merge or replace.
- The app is hosted at a fixed URL. **The URL/origin must never change**, because localStorage is tied to it. Changing the repo name or domain would strand the data.
- The service worker must use a versioned cache and update cleanly, so code updates never touch stored data.

## Tech

- Plain HTML, CSS, and vanilla JavaScript. No framework, no build step.
- Files: `index.html`, `app.js` (UI), `logic.js` (pure functions: day statuses, streaks, history), `storage.js` (load/save/migrate/export/import), `manifest.json`, `sw.js`, icons.
- `logic.js` has no DOM or storage access so it can be tested with Node (`node --test`). Include tests for: backfill, today pending, missed day ending a streak, unresolved day putting the streak on hold, brush added to a missed day.
- Hosted on GitHub Pages. Installed to the iPhone home screen via Safari → Share → Add to Home Screen. All real use happens in the home-screen app (its storage is separate from Safari's).
- Mobile-first layout, large tap targets, respects light/dark mode.

## UI (one screen is fine)

- Top: current streak (big number), best streak, "on hold" banner if unresolved days exist.
- Today card: **Morning Brush** and **Night Brush** buttons (each opens a tiny sheet: date defaulting to today, "Flossed" checkbox, Save). A smaller **Floss only** button.
- Unresolved-day prompts, if any.
- History list: last ~30 days with morning/night/floss/missed indicators; tap a day to see/delete its entries or mark it missed.
- Streak history list.
- Footer: Export / Import.

## Build order

1. `logic.js` + tests.
2. `storage.js` with schema version, export, import.
3. UI for logging and streak display.
4. Unresolved-day prompts and Missed.
5. History and streak history.
6. Manifest, icons, service worker. Deploy to GitHub Pages, install on iPhone.

Commit after each step.

## Acceptance check for tonight

- [ ] I can log tonight's Night Brush with floss from the home-screen app.
- [ ] Closing and reopening the app keeps the data.
- [ ] Streak shows 1.
- [ ] Export produces a JSON file I can save to Files.
- [ ] Pushing a code change and reopening the app keeps the data.
