# J.A.R.V.I.S

A voice-enabled personal work assistant: tasks, projects, reminders, notes, documents, calendar,
memory and a writing assistant, run by an assistant you can talk to or type to.

It is a work assistant only: no combat, weapons, threat detection or surveillance features.

## Two ways to run it

| | claude.ai artifact | Standalone site (GitHub Pages) |
|---|---|---|
| Assistant | Claude, through the page's `sample` capability, with workspace tools | Built-in command interpreter (direct commands only) |
| Storage | Private per-user database (`data/users/<uid>/jarvis/...`) | This browser's IndexedDB |
| Voice input | Not allowed in claude.ai pages, so use the keyboard's dictation key | Web Speech API (Chrome, Edge, Safari) |
| Spoken replies | Yes | Yes |
| Offline / home screen | No | Yes (service worker + manifest) |

No API key exists anywhere in this app. On claude.ai the AI runs on the viewer's own Claude
session. Live web research is off unless `VITE_SEARCH_ENDPOINT` points to a server you run that
holds the search key, and the assistant says so plainly instead of inventing results.

## Commands

```bash
npm install
npm run dev            # local development
npm run typecheck
npm test               # unit tests (Vitest)
npm run build          # standalone build → dist/
npm run test:e2e       # browser tests against dist/ (Playwright; run after build)
npm run build:claude   # single-file claude.ai page → dist-claude/jarvis.html
```

## Architecture

```
src/
  domain/types.ts       data model (tasks, projects, notes, reminders, events, memories, documents, conversations, activity)
  data/                 Repo interface + adapters (claude.ai db, IndexedDB, memory), the store, example data
  services/             actions (all writes, with activity log), queries, insights, planner, search, documents, reminders
  tools/                AI tool registry + input validation (the only way the AI can change data)
  nlp/                  date/time parser and the offline command interpreter
  ai/                   AIService interface, Claude provider, local provider, system prompt, orchestration
  voice/                VoiceService (speech to text, text to speech, streamed speech)
  app/ components/ pages/   UI
```

### Safety

- The AI can act only through the declared tools. Every tool input is validated against its schema
  (unknown fields dropped, types coerced, lengths capped, enums checked); there is no generic
  database access and no code or shell execution.
- Destructive tools (delete, clear) never run directly: they return a pending action that the user
  must confirm in the chat.
- Assistant replies are rendered as React text with a small Markdown subset. Raw HTML is never
  injected and only `http(s)` links are allowed.
- Memory refuses passwords, card numbers and keys. Users can view, edit, delete or clear it.
- Each claude.ai user's data lives under their own private database path.

### Honest limits

- Reminders fire while JARVIS is open (including in a background tab). Background push needs a
  push service or a native wrapper; `services/reminders.ts` has a single delivery hook for one.
- On the standalone site, free-form questions, writing help and AI document analysis are not
  available. Document analysis falls back to clearly labelled offline rules.
