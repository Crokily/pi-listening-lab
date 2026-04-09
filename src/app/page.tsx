import { getLabBackendOverview } from "@/server/pi/session-store";

export const dynamic = "force-dynamic";

function formatModelLabel(
  model:
    | {
        provider: string;
        id: string;
      }
    | null
    | undefined,
) {
  if (!model) {
    return "No model selected";
  }

  return `${model.provider}/${model.id}`;
}

const curlSamples = {
  createSession: `curl -X POST http://localhost:3000/api/session`,
  chat: `curl -X POST http://localhost:3000/api/chat \\
  -H "content-type: application/json" \\
  -d '{"sessionId":"<session-id>","message":"Help me design a cafe conversation for intermediate listening practice."}'`,
};

export default function Home() {
  const overview = getLabBackendOverview();
  const previewModels = overview.environment.availableModels.slice(0, 6);

  return (
    <div className="flex flex-1">
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-8 sm:px-10 lg:py-12">
        <section className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
          <div className="rounded-[2rem] border border-line/80 bg-surface-strong px-7 py-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-accent">
              Ralph US-002
            </p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Pi Listening Lab
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">
              This backend story embeds a real pi agent session behind a
              Next.js App Router service layer and adds a Kokoro-backed speech
              synthesis tool for learner-requested playback. The agent stays
              open-ended around scenarios, accents, pacing, role-play ideas,
              and corpus discovery instead of forcing a fixed lesson flow.
            </p>
            <div className="mt-8 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
              <div className="rounded-2xl border border-line/80 bg-white/70 px-4 py-4">
                <p className="font-medium text-slate-950">
                  Current backend contract
                </p>
                <p className="mt-2 leading-7">
                  `POST /api/session` creates an isolated pi-backed session.
                  `POST /api/chat` sends a message to that session and returns
                  assistant text, any new `audioItems`, and simple metadata.
                </p>
              </div>
              <div className="rounded-2xl border border-line/80 bg-white/70 px-4 py-4">
                <p className="font-medium text-slate-950">Still deferred</p>
                <p className="mt-2 leading-7">
                  Full browser chat UX, voice pickers, and inline audio cards
                  still belong to later Ralph stories.
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-line/80 bg-[#14213d] px-6 py-7 text-slate-100 shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/80">
                  Backend Status
                </p>
                <p className="mt-3 text-3xl font-semibold">
                  {overview.environment.ready ? "Ready" : "Needs model auth"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${
                  overview.environment.ready
                    ? "bg-emerald-300/20 text-emerald-100"
                    : "bg-amber-300/20 text-amber-100"
                }`}
              >
                {overview.environment.ready ? "usable" : "attention"}
              </span>
            </div>

            <dl className="mt-8 grid gap-4 text-sm">
              <div className="rounded-2xl border border-white/[0.12] bg-white/[0.06] px-4 py-4">
                <dt className="text-slate-300">Preferred model</dt>
                <dd className="mt-2 font-mono text-xs leading-6 text-slate-50">
                  {formatModelLabel(overview.environment.preferredModel)}
                </dd>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/[0.12] bg-white/[0.06] px-4 py-4">
                  <dt className="text-slate-300">Configured models</dt>
                  <dd className="mt-2 text-2xl font-semibold text-slate-50">
                    {overview.environment.availableModelCount}
                  </dd>
                </div>
                <div className="rounded-2xl border border-white/[0.12] bg-white/[0.06] px-4 py-4">
                  <dt className="text-slate-300">Active sessions</dt>
                  <dd className="mt-2 text-2xl font-semibold text-slate-50">
                    {overview.activeSessions}
                  </dd>
                </div>
              </div>
              <div className="rounded-2xl border border-white/[0.12] bg-white/[0.06] px-4 py-4">
                <dt className="text-slate-300">Data root</dt>
                <dd className="mt-2 font-mono text-xs leading-6 text-slate-50">
                  {overview.dataRootPath}
                </dd>
              </div>
            </dl>

            <div className="mt-6">
              <p className="text-sm font-medium text-slate-50">
                Model discovery preview
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {previewModels.length > 0 ? (
                  previewModels.map((model) => (
                    <span
                      key={`${model.provider}/${model.id}`}
                      className="rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1 font-mono text-[11px] text-slate-100"
                    >
                      {model.provider}/{model.id}
                    </span>
                  ))
                ) : (
                  <span className="rounded-full border border-amber-200/[0.25] bg-amber-300/[0.1] px-3 py-1 text-[11px] text-amber-100">
                    No authenticated pi model available yet.
                  </span>
                )}
              </div>
              {overview.environment.warning ? (
                <p className="mt-4 text-sm leading-7 text-amber-100/90">
                  {overview.environment.warning}
                </p>
              ) : null}
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            {
              label: "Session isolation",
              value: ".data/sessions/<sessionId>/workspace",
              copy: "Each browser session gets its own repo-local workspace and record directory so the embedded pi tools do not operate in the app source tree by default.",
            },
            {
              label: "Store model",
              value: "Single-process global map",
              copy: "The server keeps pi AgentSession instances in memory and can retrieve them by API session id for continued conversation turns.",
            },
            {
              label: "Route runtime",
              value: "Node.js route handlers",
              copy: "Both API endpoints run on the Node runtime and keep pi SDK code in server-only modules to avoid Edge and bundling issues.",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[1.6rem] border border-line/80 bg-surface px-5 py-5 shadow-[0_14px_50px_rgba(15,23,42,0.06)] backdrop-blur"
            >
              <p className="text-sm font-semibold text-slate-950">{item.label}</p>
              <p className="mt-3 font-mono text-xs text-accent">{item.value}</p>
              <p className="mt-4 text-sm leading-7 text-slate-700">{item.copy}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="rounded-[1.8rem] border border-line/80 bg-surface-strong px-6 py-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              POST /api/session
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Create a pi-backed conversation
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              The session route creates a new in-memory store entry, prepares a
              repo-local workspace under `.data`, initializes a real pi
              `AgentSession`, and returns ids plus backend metadata.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-7 text-slate-100">
              <code>{curlSamples.createSession}</code>
            </pre>
          </article>

          <article className="rounded-[1.8rem] border border-line/80 bg-surface-strong px-6 py-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)]">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              POST /api/chat
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-950">
              Send an open-ended listening prompt
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              The chat route accepts `{"{"} sessionId, message {"}"}` and
              returns assistant text plus any newly generated `audioItems` from
              the current turn. Audio binaries are served separately from
              `/api/audio/[audioId]`.
            </p>
            <pre className="mt-5 overflow-x-auto rounded-2xl bg-slate-950 px-4 py-4 text-xs leading-7 text-slate-100">
              <code>{curlSamples.chat}</code>
            </pre>
          </article>
        </section>
      </main>
    </div>
  );
}
