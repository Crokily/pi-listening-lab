# Pi Listening Lab

Pi Listening Lab is a local-first Next.js app for designing English listening
practice with an embedded `pi` session. The agent stays open-ended around
scenario design, difficulty tuning, accent/pacing ideas, and corpus iteration.
When the user explicitly asks to hear text, the app calls a local
Kokoro-FastAPI server and returns playable audio in the chat UI.

## Overview

- Frontend: Next.js 16 App Router, React 19, Tailwind 4.
- Agent runtime: `@mariozechner/pi-coding-agent` running on the server.
- Speech: Kokoro-FastAPI through its OpenAI-compatible
  `POST /v1/audio/speech` endpoint.
- Storage: repo-local `.data/` directory for generated audio plus per-session
  workspaces and records.

## Architecture

1. The homepage creates a lab session with `POST /api/session`.
2. The server allocates an isolated workspace under
   `.data/sessions/<sessionId>/workspace`.
3. `createAgentSession()` boots a real pi session with pi's default coding
   tools plus one custom tool: `synthesize_speech`.
4. `POST /api/chat` sends the user turn to pi, collects assistant text, and
   gathers any generated audio items from successful tool executions.
5. Generated audio is written under `.data/audio` and served back through
   `GET /api/audio/[audioId]`.

## Prerequisites

- Node.js `>=20.9.0` for Next.js 16. This repo was validated with Node
  `v24.13.0`.
- `npm install`
- A pi-capable model on the host machine, provided by either:
  - `pi` CLI login via `/login`
  - Provider API keys exposed to the Next.js server process
- A running Kokoro-FastAPI server reachable from the app server

## Install

```bash
npm install
cp .env.example .env.local
```

Then update `.env.local` if you do not want the defaults.

## Environment Variables

The app itself only requires Kokoro settings. pi model access is inherited from
the host machine through the pi SDK.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KOKORO_BASE_URL` | `http://127.0.0.1:8880` | Base URL for Kokoro-FastAPI |
| `KOKORO_API_KEY` | empty | Optional bearer token for protected Kokoro deployments |
| `KOKORO_MODEL` | `kokoro` | Model name sent to `/v1/audio/speech` |
| `KOKORO_VOICE` | `af_bella` | Default voice when the tool call omits one |
| `PI_CODING_AGENT_DIR` | `~/.pi/agent` | Optional override for pi auth/model storage |
| `OPENAI_API_KEY` | empty | Optional provider key if you are not using `/login` |
| `ANTHROPIC_API_KEY` | empty | Optional provider key if you are not using `/login` |
| `GEMINI_API_KEY` | empty | Optional provider key if you are not using `/login` |
| `OPENROUTER_API_KEY` | empty | Optional provider key if you are not using `/login` |
| `GROQ_API_KEY` | empty | Optional provider key if you are not using `/login` |

See [`.env.example`](./.env.example) for copy-paste-ready comments.

## pi Auth and Model Availability

This site does not implement its own model-auth UI. It embeds pi sessions and
uses the same pi auth/model lookup that the CLI uses on the host machine:

- Auth storage: `~/.pi/agent/auth.json`
- Model registry: `~/.pi/agent/models.json`
- Optional override: `PI_CODING_AGENT_DIR=/some/path`

Recommended setup:

```bash
./node_modules/.bin/pi
# inside pi:
/login
```

If you do not have a global `pi` install, the repo-local binary above is
enough. You can also use `npx pi`.

Alternative setup: put provider API keys in `.env.local` before starting
`npm run dev`. The pi SDK will pick them up from the server process.

Useful checks:

```bash
./node_modules/.bin/pi --list-models
./node_modules/.bin/pi --model openai/gpt-4o-mini -p "ping"
```

What to expect in the app:

- The homepage can load even if no model is available.
- `POST /api/session` can still return a session skeleton with a warning.
- `POST /api/chat` returns `503 MODEL_UNAVAILABLE` until pi can resolve a
  model.
- The app refreshes pi auth/model data lazily, so a new `/login` or provider
  key usually does not require restarting Next.js.

## Kokoro-FastAPI Setup

This app expects Kokoro's OpenAI-compatible speech endpoint at
`$KOKORO_BASE_URL/v1/audio/speech`.

### Local Docker Example

```bash
docker run --rm -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

GPU variant:

```bash
docker run --rm --gpus all -p 8880:8880 ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

Then keep the app default:

```bash
KOKORO_BASE_URL=http://127.0.0.1:8880
KOKORO_MODEL=kokoro
KOKORO_VOICE=af_bella
```

Quick sanity checks:

```bash
curl http://127.0.0.1:8880/docs
curl http://127.0.0.1:8880/v1/audio/voices
```

If your Kokoro deployment requires a token, set `KOKORO_API_KEY`.

## Run Locally

Start Kokoro first, then start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Verify

Browser checks:

- The status area should show that a model is available once pi auth is ready.
- Sending a normal chat prompt should return assistant text.
- Sending a prompt such as `Read this aloud: "Please proceed to gate 12."`
  should render an audio card with an inline player.

Short smoke test:

```bash
SESSION_ID=$(
  curl -s -X POST http://localhost:3000/api/session \
    | node -pe "JSON.parse(require('fs').readFileSync(0, 'utf8')).sessionId"
)

curl -s -X POST http://localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"message\":\"Say hello and read this aloud: Hello from Pi Listening Lab.\"}"
```

If Kokoro is reachable and a pi model is available, the response should include
`assistantText` and an `audioItems` array.

## API Summary

- `POST /api/session`
  - Creates an in-memory lab session plus on-disk workspace directories.
- `POST /api/chat`
  - Sends one chat turn to the embedded pi session.
  - Returns assistant text, any generated audio items, and turn metadata.
- `GET /api/audio/[audioId]`
  - Streams previously generated audio bytes for in-browser playback.

## Project Structure

```text
src/app/                     App Router pages, route handlers, and UI
src/app/_components/         Client chat experience
src/server/pi/               Server-only pi, Kokoro, audio, and session code
src/lib/pi/                  Shared API contracts and browser client helpers
.data/audio/                 Generated audio files and metadata
.data/sessions/              Per-session workspaces and pi session records
```

## Current Limitations

- Session state is kept in memory, so active sessions disappear on server
  restart or deploy.
- Generated audio is stored locally under `.data/` with no cleanup policy yet.
- There is no app-level auth, tenancy, or rate limiting. This is a local/dev
  setup.
- The app assumes a trusted Kokoro endpoint and does not yet expose voice
  discovery or richer audio metadata in the UI.

## Likely Next Extensions

- Persist and resume sessions across restarts.
- Stream assistant output and tool progress into the UI.
- Surface available Kokoro voices directly from the backend.
- Add cleanup/retention controls for `.data/audio` and old session workspaces.
- Harden the app for multi-user or hosted deployment scenarios.
