# StudyFlow

A mobile-first student productivity app built as a single HTML file. Connects to Canvas LMS to sync assignments and grades, stores data in Supabase, and sends email reminders for upcoming due dates.

## Project Structure

```
studyflow/
├── index.html          # Entire frontend — all HTML, CSS, and JS in one file
├── supabase/
│   ├── config.toml     # Supabase local dev config
│   ├── migrations/     # Database schema migrations
│   └── functions/
│       ├── canvas-sync/    # Edge function: syncs assignments & grades from Canvas
│       └── send-reminders/ # Edge function: emails users about assignments due tomorrow
└── auto-sync.ps1       # PowerShell script for auto git push on file save
```

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS — single `index.html` file, no build step needed
- **Backend:** Supabase (auth, database, edge functions)
- **Canvas integration:** Canvas LMS REST API via the `canvas-sync` edge function
- **Email:** Resend API via the `send-reminders` edge function

## Supabase

- **Project URL:** `https://xbcvztaeslmbcgzamrvi.supabase.co`
- **Anon key:** already hardcoded in `index.html` (safe — it's a public key)
- **Service role key / Resend key:** stored as Supabase edge function secrets (never in code)

## Running the App

Just open `index.html` in a browser — no server or build step required.

To work on edge functions, install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run:
```bash
supabase functions serve
```

## Auto-Sync

Run `auto-sync.ps1` in PowerShell to automatically commit and push changes whenever you save a file:
```powershell
powershell -ExecutionPolicy Bypass -File auto-sync.ps1
```

## Key Concepts

- All app state lives in Supabase — no local storage for user data
- The app detects onboarding state on load and routes accordingly
- Dark/light theme uses CSS variables toggled via `data-theme="dark"` on `<html>`
- Mobile layout uses a bottom nav bar; desktop uses tabs
- Canvas sync deletes and re-inserts assignments each run (only future due dates kept)
