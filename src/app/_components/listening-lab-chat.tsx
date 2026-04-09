"use client";

import {
  startTransition,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import {
  PiLabApiError,
  clearCachedLabSession,
  getCachedLabSession,
  getOrCreateLabSession,
  sendLabChatMessage,
} from "@/lib/pi/browser-client";
import type {
  LabAudioItem,
  LabBackendOverview,
  LabChatResponse,
  LabSessionResponse,
} from "@/lib/pi/contracts";

type SessionStatus = "idle" | "creating" | "ready" | "error";

interface VoiceHintOption {
  id: string;
  label: string;
  description: string;
  hint: string | null;
}

interface StarterPrompt {
  id: string;
  label: string;
  detail: string;
  prompt: string;
}

interface UserTranscriptMessage {
  id: string;
  role: "user";
  text: string;
  createdAt: string;
}

interface AssistantTranscriptMessage {
  id: string;
  role: "assistant";
  text: string;
  createdAt: string;
  audioItems: LabAudioItem[];
  meta: LabChatResponse["meta"];
}

type TranscriptMessage = UserTranscriptMessage | AssistantTranscriptMessage;

const VOICE_HINTS: VoiceHintOption[] = [
  {
    id: "agent-default",
    label: "Agent default",
    description: "Leave speech synthesis on the server's configured default.",
    hint: null,
  },
  {
    id: "warm-calm",
    label: "Warm calm",
    description: "Useful for relaxed listening practice and softer pacing.",
    hint: "If you generate spoken audio, prefer a warm, calm voice with relaxed pacing.",
  },
  {
    id: "neutral-clear",
    label: "Neutral clear",
    description: "Good for everyday comprehension and plain diction.",
    hint: "If you generate spoken audio, prefer a neutral, very clear voice for listening practice.",
  },
  {
    id: "bright-friendly",
    label: "Bright friendly",
    description: "Fits conversational role-play and lighter dialogue.",
    hint: "If you generate spoken audio, prefer a bright, friendly speaking style.",
  },
  {
    id: "measured-pro",
    label: "Measured pro",
    description: "Helpful for meetings, interviews, and formal situations.",
    hint: "If you generate spoken audio, prefer a measured, professional speaking style.",
  },
];

const STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: "airport",
    label: "Airport handoff",
    detail: "Gate changes, fast announcements, and repair strategies.",
    prompt:
      "Help me design an airport check-in and gate-change listening scenario for intermediate learners. Include likely misunderstandings, useful phrases, and a short sample exchange.",
  },
  {
    id: "cafe",
    label: "Cafe order",
    detail: "Natural turn-taking, clarifying questions, and polite phrasing.",
    prompt:
      "Create a cafe ordering conversation for English listening practice. I want natural interruptions, one small misunderstanding, and follow-up questions I can ask after listening.",
  },
  {
    id: "interview",
    label: "Job interview",
    detail: "Formal pacing, nervous phrasing, and comprehension traps.",
    prompt:
      "Design a short job interview dialogue for upper-intermediate listening practice, then suggest how to vary the pacing, formality, and difficulty without turning it into a fixed lesson.",
  },
  {
    id: "meeting",
    label: "Team meeting",
    detail: "Overlapping opinions, decisions, and recap language.",
    prompt:
      "I need a team meeting listening scenario about shifting project priorities. Make it conversational and suggest how Pi could turn it into a stronger listening corpus.",
  },
];

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  hour: "numeric",
  hour12: true,
  minute: "2-digit",
  month: "short",
  timeZone: "UTC",
});

const numberFormatter = new Intl.NumberFormat("en-US");

function createMessageId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatTimestamp(timestamp: string) {
  const value = new Date(timestamp);

  if (Number.isNaN(value.getTime())) {
    return "Unknown time";
  }

  return `${timestampFormatter.format(value)} UTC`;
}

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1_000) {
    return `${elapsedMs} ms`;
  }

  const seconds = elapsedMs / 1_000;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
}

function formatModelLabel(
  model:
    | LabBackendOverview["environment"]["preferredModel"]
    | LabSessionResponse["agent"]["currentModel"],
) {
  if (!model) {
    return "No model attached";
  }

  return `${model.provider}/${model.id}`;
}

function buildApiMessage(text: string, voiceHint: VoiceHintOption) {
  const trimmedText = text.trim();

  if (!voiceHint.hint) {
    return trimmedText;
  }

  return `${trimmedText}\n\nAudio preference: ${voiceHint.hint} Only apply this preference if you decide to generate audio for this turn.`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof PiLabApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "The listening lab request failed. Please try again.";
}

function StatusPulse({ tone }: { tone: "accent" | "amber" | "rose" }) {
  const classes =
    tone === "accent"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-rose-500";

  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${classes} opacity-65`} />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${classes}`} />
    </span>
  );
}

function TypingBubble() {
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-[1.75rem] rounded-bl-md border border-white/65 bg-white/88 px-5 py-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent/80">
          Pi is responding
        </p>
        <div className="mt-3 flex gap-2">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent/70"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AudioCard({ item }: { item: LabAudioItem }) {
  return (
    <article className="rounded-[1.5rem] border border-emerald-900/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(239,249,246,0.92))] p-4 shadow-[0_18px_40px_rgba(15,118,110,0.10)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-accent">
            Playable Audio
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-950">
            {item.voice}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
            {item.format}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
            {formatTimestamp(item.createdAt)}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-700">{item.text}</p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-900/10 bg-white px-3 py-3">
        <audio
          controls
          preload="none"
          className="w-full accent-emerald-700"
          src={item.url}
        >
          Your browser does not support inline audio playback.
        </audio>
      </div>
    </article>
  );
}

function AssistantMessageCard({
  message,
}: {
  message: AssistantTranscriptMessage;
}) {
  return (
    <article className="max-w-[88%] rounded-[1.85rem] rounded-bl-md border border-white/65 bg-white/88 px-5 py-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent/80">
          Pi Assistant
        </p>
        <p className="text-xs text-slate-500">{formatTimestamp(message.createdAt)}</p>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-800">
        {message.text}
      </p>

      {message.audioItems.length > 0 ? (
        <div className="mt-5 space-y-3">
          {message.audioItems.map((item) => (
            <AudioCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
          {formatElapsed(message.meta.elapsedMs)}
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
          {numberFormatter.format(message.meta.messageCount)} messages
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
          {message.meta.toolCalls === 1
            ? "1 tool call"
            : `${message.meta.toolCalls} tool calls`}
        </span>
      </div>
    </article>
  );
}

function UserMessageCard({ message }: { message: UserTranscriptMessage }) {
  return (
    <article className="max-w-[82%] rounded-[1.85rem] rounded-br-md border border-amber-950/10 bg-[linear-gradient(145deg,#fff4df,#f7d6a7)] px-5 py-4 text-slate-900 shadow-[0_24px_80px_rgba(194,107,45,0.18)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#9a4f21]">
          You
        </p>
        <p className="text-xs text-[#8b5f3a]">{formatTimestamp(message.createdAt)}</p>
      </div>

      <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-900">
        {message.text}
      </p>
    </article>
  );
}

export function ListeningLabChat({
  initialOverview,
}: {
  initialOverview: LabBackendOverview;
}) {
  const cachedSession = getCachedLabSession();
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const didAutostartRef = useRef(false);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const composerId = useId();

  const [session, setSession] = useState<LabSessionResponse | null>(cachedSession);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>(
    cachedSession ? "ready" : "idle",
  );
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [selectedVoiceId, setSelectedVoiceId] = useState(VOICE_HINTS[0].id);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedVoice =
    VOICE_HINTS.find((voice) => voice.id === selectedVoiceId) ?? VOICE_HINTS[0];

  async function establishSession({
    force = false,
    resetTranscript = false,
  }: {
    force?: boolean;
    resetTranscript?: boolean;
  } = {}) {
    setSessionStatus("creating");
    setSessionError(null);
    setChatError(null);

    if (force) {
      clearCachedLabSession();
    }

    try {
      const nextSession = await getOrCreateLabSession({ force });

      setSession(nextSession);
      setSessionStatus("ready");

      if (resetTranscript) {
        setMessages([]);
      }

      return nextSession;
    } catch (error) {
      setSessionStatus("error");
      setSession(null);
      setSessionError(getErrorMessage(error));
      throw error;
    }
  }

  const autostartSession = useEffectEvent(() => {
    void establishSession();
  });

  useEffect(() => {
    if (didAutostartRef.current || session) {
      return;
    }

    didAutostartRef.current = true;
    autostartSession();
  }, [session]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({
      behavior: messages.length > 0 || isSubmitting ? "smooth" : "auto",
      block: "end",
    });
  }, [isSubmitting, messages]);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    const trimmedDraft = draft.trim();

    if (!trimmedDraft || isSubmitting) {
      return;
    }

    const optimisticMessage: UserTranscriptMessage = {
      id: createMessageId("user"),
      role: "user",
      text: trimmedDraft,
      createdAt: new Date().toISOString(),
    };

    setChatError(null);
    setIsSubmitting(true);
    setDraft("");
    setMessages((current) => [...current, optimisticMessage]);

    try {
      const activeSession =
        session ??
        (await establishSession({
          force: false,
        }));

      const response = await sendLabChatMessage({
        sessionId: activeSession.sessionId,
        message: buildApiMessage(trimmedDraft, selectedVoice),
      });

      const assistantMessage: AssistantTranscriptMessage = {
        id: createMessageId("assistant"),
        role: "assistant",
        text: response.assistantText,
        createdAt: response.meta.updatedAt,
        audioItems: response.audioItems,
        meta: response.meta,
      };

      setSession((current) =>
        current
          ? {
              ...current,
              updatedAt: response.meta.updatedAt,
            }
          : current,
      );
      setMessages((current) => [...current, assistantMessage]);
    } catch (error) {
      const userFacingMessage =
        error instanceof PiLabApiError && error.code === "SESSION_NOT_FOUND"
          ? "That session is no longer available on the server. Start a fresh session to continue."
          : getErrorMessage(error);

      if (error instanceof PiLabApiError && error.code === "SESSION_NOT_FOUND") {
        clearCachedLabSession();
        setSession(null);
        setSessionStatus("error");
        setSessionError(userFacingMessage);
      }

      setMessages((current) =>
        current.filter((message) => message.id !== optimisticMessage.id),
      );
      setDraft(trimmedDraft);
      setChatError(`${userFacingMessage} Your draft is back in the composer.`);
    } finally {
      setIsSubmitting(false);
      composerRef.current?.focus();
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void handleSubmit();
    }
  }

  function applyStarterPrompt(prompt: StarterPrompt) {
    startTransition(() => {
      setDraft(prompt.prompt);
      setChatError(null);
    });

    composerRef.current?.focus();
  }

  const primaryModel =
    session?.agent.currentModel ??
    session?.agent.preferredModel ??
    initialOverview.environment.preferredModel;
  const showResetAction = messages.length > 0;

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_22rem]">
      <div className="overflow-hidden rounded-[2rem] border border-white/55 bg-white/72 shadow-[0_32px_120px_rgba(15,23,42,0.10)] backdrop-blur-2xl">
        <div className="border-b border-slate-900/8 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/85 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
                  {sessionStatus === "ready" ? (
                    <StatusPulse tone={session?.agent.ready ? "accent" : "amber"} />
                  ) : sessionStatus === "creating" ? (
                    <StatusPulse tone="accent" />
                  ) : sessionStatus === "error" ? (
                    <StatusPulse tone="rose" />
                  ) : (
                    <StatusPulse tone="amber" />
                  )}
                  {sessionStatus === "ready"
                    ? session?.agent.ready
                      ? "Session live"
                      : "Session created"
                    : sessionStatus === "creating"
                      ? "Preparing session"
                      : sessionStatus === "error"
                        ? "Session blocked"
                        : "Waiting to connect"}
                </span>
                {session?.sessionId ? (
                  <span className="rounded-full border border-slate-200 bg-white/85 px-3 py-1 font-mono text-[11px] text-slate-500">
                    {session.sessionId.slice(0, 8)}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                Listening practice chat
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">
                Ask for scenario design, accent or pacing changes, script ideas,
                corpus revisions, or optional spoken examples. The agent stays
                conversational instead of pushing a fixed lesson flow.
              </p>
            </div>

            <div className="rounded-[1.4rem] border border-slate-200/80 bg-white/85 px-4 py-3 text-sm text-slate-600 shadow-[0_14px_40px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Current model
              </p>
              <p className="mt-2 font-mono text-[12px] leading-6 text-slate-800">
                {formatModelLabel(primaryModel)}
              </p>
            </div>
          </div>
        </div>

        <div className="chat-scroll min-h-[28rem] space-y-5 overflow-y-auto px-5 py-5 sm:px-6 lg:min-h-[40rem]">
          {messages.length === 0 ? (
            <div className="rounded-[1.8rem] border border-dashed border-slate-300/85 bg-[linear-gradient(135deg,rgba(255,255,255,0.82),rgba(239,249,246,0.65))] px-5 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent">
                Empty Transcript
              </p>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                Start anywhere.
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                Pi Listening Lab is for open-ended English listening corpus
                design. Try a scenario, an accent contrast, a pacing constraint,
                a comprehension goal, or a request to hear a selected passage.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    onClick={() => applyStarterPrompt(prompt)}
                    className="rounded-full border border-emerald-900/10 bg-white/85 px-4 py-2 text-sm font-medium text-slate-700 transition hover:-translate-y-0.5 hover:border-accent/35 hover:text-slate-950"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((message) => (
            <div
              key={message.id}
              className={message.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              {message.role === "user" ? (
                <UserMessageCard message={message} />
              ) : (
                <AssistantMessageCard message={message} />
              )}
            </div>
          ))}

          {isSubmitting ? <TypingBubble /> : null}

          <div ref={transcriptEndRef} />
        </div>

        <div className="border-t border-slate-900/8 bg-[linear-gradient(180deg,rgba(255,252,248,0.88),rgba(255,249,241,0.98))] px-5 py-5 sm:px-6">
          {chatError ? (
            <div className="mb-4 rounded-[1.4rem] border border-rose-900/10 bg-rose-50/90 px-4 py-3 text-sm leading-6 text-rose-900">
              {chatError}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label htmlFor={composerId} className="sr-only">
              Message the listening practice agent
            </label>

            <div className="rounded-[1.8rem] border border-slate-200/85 bg-white/92 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.07)]">
              <textarea
                id={composerId}
                ref={composerRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder="Ask for a scenario, tune the listening difficulty, request a revised dialogue, or ask Pi to read a selected passage aloud."
                className="min-h-32 w-full resize-none bg-transparent px-3 py-3 text-[15px] leading-7 text-slate-900 outline-none placeholder:text-slate-400"
              />

              <div className="flex flex-col gap-3 border-t border-slate-100 px-3 pt-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1 text-sm text-slate-500">
                  <p className="font-medium text-slate-700">
                    Playback hint: {selectedVoice.label}
                  </p>
                  <p className="leading-6">
                    {selectedVoice.description}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={!draft.trim() || isSubmitting}
                  className="inline-flex min-w-36 items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isSubmitting
                    ? "Sending..."
                    : sessionStatus === "creating"
                      ? "Connecting..."
                      : "Send message"}
                </button>
              </div>
            </div>

            <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
              Enter sends. Shift+Enter makes a new line.
            </p>
          </form>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-[1.8rem] border border-[#132033]/10 bg-[#132033] px-5 py-5 text-slate-100 shadow-[0_24px_90px_rgba(15,23,42,0.16)]">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-amber-200/85">
            Lab Snapshot
          </p>
          <div className="mt-4 space-y-4">
            <div className="rounded-[1.4rem] border border-white/10 bg-white/8 px-4 py-4">
              <p className="text-sm text-slate-300">
                {initialOverview.environment.ready
                  ? "A model is available on the server."
                  : "The UI is live, but Pi still needs a model login or provider key."}
              </p>
              <p className="mt-3 font-mono text-xs leading-6 text-slate-100">
                {formatModelLabel(initialOverview.environment.preferredModel)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[1.3rem] border border-white/10 bg-white/8 px-4 py-4">
                <p className="text-slate-300">Configured models</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {numberFormatter.format(initialOverview.environment.availableModelCount)}
                </p>
              </div>
              <div className="rounded-[1.3rem] border border-white/10 bg-white/8 px-4 py-4">
                <p className="text-slate-300">Sessions at load</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {numberFormatter.format(initialOverview.activeSessions)}
                </p>
              </div>
            </div>

            {initialOverview.environment.warning ? (
              <div className="rounded-[1.4rem] border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm leading-7 text-amber-100">
                {initialOverview.environment.warning}
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/55 bg-white/76 px-5 py-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent">
                Session State
              </p>
              <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                {sessionStatus === "ready"
                  ? session?.agent.ready
                    ? "Ready to converse"
                    : "Waiting for model auth"
                  : sessionStatus === "creating"
                    ? "Starting a fresh session"
                    : sessionStatus === "error"
                      ? "Session unavailable"
                      : "Preparing workspace"}
              </h3>
            </div>

            {sessionStatus === "ready" ? (
              <StatusPulse tone={session?.agent.ready ? "accent" : "amber"} />
            ) : sessionStatus === "error" ? (
              <StatusPulse tone="rose" />
            ) : (
              <StatusPulse tone="accent" />
            )}
          </div>

          <div className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
            {session ? (
              <>
                <p>
                  Workspace:{" "}
                  <span className="font-mono text-xs text-slate-700">
                    {session.workspacePath}
                  </span>
                </p>
                <p>
                  Session created:{" "}
                  <span className="text-slate-700">
                    {formatTimestamp(session.createdAt)}
                  </span>
                </p>
              </>
            ) : (
              <p>
                The UI can create a session automatically, or recover with a
                fresh one if the in-memory store was restarted.
              </p>
            )}

            {session?.agent.warning ? (
              <div className="rounded-[1.3rem] border border-amber-300/35 bg-amber-50 px-4 py-3 text-amber-900">
                {session.agent.warning}
              </div>
            ) : null}

            {sessionError ? (
              <div className="rounded-[1.3rem] border border-rose-900/10 bg-rose-50 px-4 py-3 text-rose-900">
                {sessionError}
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                void establishSession({
                  force: true,
                  resetTranscript: showResetAction,
                })
              }
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300 hover:text-slate-950"
            >
              {showResetAction ? "Start fresh session" : "Retry connection"}
            </button>
            {showResetAction ? (
              <p className="text-xs leading-6 text-slate-500">
                Starting fresh clears the current transcript because sessions are
                in-memory only.
              </p>
            ) : null}
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/55 bg-white/76 px-5 py-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent">
            Playback Hint
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            Voice selection stays optional
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Pick a speaking style if you want a nudge for future audio. It is
            only added as a preference hint to your message and does not force
            the agent into a fixed workflow.
          </p>

          <div className="mt-5 flex flex-wrap gap-2">
            {VOICE_HINTS.map((voice) => {
              const isSelected = voice.id === selectedVoice.id;

              return (
                <button
                  key={voice.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setSelectedVoiceId(voice.id)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    isSelected
                      ? "border-accent bg-accent text-white shadow-[0_12px_30px_rgba(15,118,110,0.24)]"
                      : "border-slate-200 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-accent/30 hover:text-slate-950"
                  }`}
                >
                  {voice.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-white/55 bg-white/76 px-5 py-5 shadow-[0_22px_80px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-accent">
            Starter Prompts
          </p>
          <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
            Quick ways to begin
          </h3>

          <div className="mt-5 space-y-3">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => applyStarterPrompt(prompt)}
                className="block w-full rounded-[1.4rem] border border-slate-200/85 bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-[0_18px_35px_rgba(15,23,42,0.06)]"
              >
                <p className="font-semibold text-slate-950">{prompt.label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {prompt.detail}
                </p>
              </button>
            ))}
          </div>
        </section>
      </aside>
    </section>
  );
}
