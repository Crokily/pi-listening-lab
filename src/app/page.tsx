import { ListeningLabChat } from "@/app/_components/listening-lab-chat";
import { getLabBackendOverview } from "@/server/pi/session-store";

export const dynamic = "force-dynamic";

const productPillars = [
  "Open-ended conversation design",
  "Accent, pacing, and difficulty tuning",
  "Optional in-browser audio playback",
];

export default function Home() {
  const overview = getLabBackendOverview();

  return (
    <div className="flex flex-1">
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <section className="overflow-hidden rounded-[2.4rem] border border-white/55 bg-[linear-gradient(145deg,rgba(19,32,51,0.96),rgba(29,78,72,0.92))] px-6 py-8 text-white shadow-[0_36px_120px_rgba(15,23,42,0.22)] sm:px-8 lg:px-10 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.75fr)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.32em] text-amber-200/90">
                Ralph US-003
              </p>
              <h1 className="mt-4 max-w-4xl font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Practice listening inside the conversation.
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-200 sm:text-lg">
                Pi Listening Lab keeps the agent open-ended around English
                listening corpus design. Use the chat to sketch scenarios,
                pressure-test comprehension, vary accents and pacing, and ask
                for playable audio only when it helps.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {productPillars.map((pillar) => (
                  <span
                    key={pillar}
                    className="rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-slate-100 backdrop-blur"
                  >
                    {pillar}
                  </span>
                ))}
              </div>
            </div>

            <aside className="rounded-[1.9rem] border border-white/12 bg-white/10 px-5 py-5 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200/85">
                Product Positioning
              </p>
              <div className="mt-4 space-y-4 text-sm leading-7 text-slate-200">
                <p>
                  This is not a fixed lesson wizard. The agent should stay
                  conversational and help the user shape listening material
                  however they need.
                </p>
                <p>
                  Session creation, transcript rendering, and audio playback now
                  happen directly on the homepage against the existing pi-backed
                  APIs.
                </p>
                <p className="rounded-[1.4rem] border border-white/10 bg-black/10 px-4 py-3 font-mono text-xs leading-6 text-slate-100">
                  Server ready: {overview.environment.ready ? "yes" : "not yet"}
                </p>
              </div>
            </aside>
          </div>
        </section>

        <ListeningLabChat initialOverview={overview} />
      </main>
    </div>
  );
}
