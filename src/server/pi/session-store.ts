import "server-only";

import { randomUUID } from "node:crypto";

import {
  DefaultResourceLoader,
  SessionManager,
  createAgentSession,
  createCodingTools,
  type AgentSession,
} from "@mariozechner/pi-coding-agent";

import { type LabAudioItem } from "@/server/pi/audio-store";
import {
  synthesizeSpeechTool,
  type SynthesizeSpeechToolDetails,
} from "@/server/pi/kokoro";
import {
  ensureDataDirectories,
  ensureSessionPaths,
  getDataRoot,
  toRepoRelativePath,
  type SessionPaths,
} from "@/server/pi/paths";
import {
  getPiEnvironmentStatus,
  pickPreferredModel,
  refreshPiServices,
  serializeModel,
  type ModelSummary,
  type PiEnvironmentStatus,
} from "@/server/pi/services";

const LISTENING_LAB_PROMPT = `## Product Context
You are embedded in Pi Listening Lab.

- Help the user explore English listening scenarios, role-play ideas, accents, pacing, difficulty, and corpus ideas.
- Stay open-ended and conversational. Offer options and examples when useful.
- Do not force a fixed lesson plan or workflow unless the user explicitly asks for one.
- You still have your default pi coding tools. Use them only when they genuinely help the user's request.
- You can synthesize speech for selected text when the user explicitly wants to hear it. Do not generate audio unless the user asks for playback or listening material.
- Your working directory is an isolated per-session workspace for scratch notes and generated artifacts.`;

const NO_MODEL_MESSAGE =
  "No pi model is available on this server right now. Run `pi` and `/login` on the machine or configure a supported provider API key, then create a new session.";

interface SessionRecord {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  paths: SessionPaths;
  session: AgentSession;
  modelWarning: string | null;
  pendingTurn: Promise<LabChatResponse> | null;
}

export interface LabSessionResponse {
  sessionId: string;
  piSessionId: string;
  createdAt: string;
  updatedAt: string;
  workspacePath: string;
  recordsPath: string;
  sessionFilePath: string | null;
  agent: {
    ready: boolean;
    currentModel: ModelSummary | null;
    preferredModel: ModelSummary | null;
    availableModelCount: number;
    warning: string | null;
  };
  api: {
    createSession: string;
    chat: string;
    chatRequestShape: {
      sessionId: "string";
      message: "string";
    };
    chatResponseShape: {
      sessionId: "string";
      assistantText: "string";
      audioItems: "array";
      meta: "object";
    };
  };
}

export interface LabChatResponse {
  sessionId: string;
  assistantText: string;
  audioItems: LabAudioItem[];
  meta: {
    piSessionId: string;
    model: ModelSummary | null;
    elapsedMs: number;
    toolCalls: number;
    messageCount: number;
    updatedAt: string;
    workspacePath: string;
    sessionFilePath: string | null;
  };
}

export interface LabBackendOverview {
  activeSessions: number;
  dataRootPath: string;
  environment: PiEnvironmentStatus;
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session "${sessionId}" was not found. Create a new session first.`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionBusyError extends Error {
  constructor(sessionId: string) {
    super(
      `Session "${sessionId}" is already handling another turn. Wait for that response before sending a new message.`,
    );
    this.name = "SessionBusyError";
  }
}

export class ModelUnavailableError extends Error {
  constructor(
    message: string,
    readonly status: PiEnvironmentStatus,
  ) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

class LabSessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  get size() {
    return this.sessions.size;
  }

  async createSession(): Promise<LabSessionResponse> {
    await ensureDataDirectories();

    const sessionId = randomUUID();
    const paths = await ensureSessionPaths(sessionId);
    const resourceLoader = await this.createResourceLoader(paths.workspaceDir);
    const services = refreshPiServices();
    const { session, modelFallbackMessage } = await createAgentSession({
      cwd: paths.workspaceDir,
      authStorage: services.authStorage,
      modelRegistry: services.modelRegistry,
      resourceLoader,
      sessionManager: SessionManager.create(paths.workspaceDir, paths.recordsDir),
      tools: createCodingTools(paths.workspaceDir),
      customTools: [synthesizeSpeechTool],
    });
    const now = new Date().toISOString();

    const record: SessionRecord = {
      sessionId,
      createdAt: now,
      updatedAt: now,
      paths,
      session,
      modelWarning: modelFallbackMessage ?? null,
      pendingTurn: null,
    };

    this.sessions.set(sessionId, record);

    return this.buildSessionResponse(record);
  }

  async chat(sessionId: string, message: string): Promise<LabChatResponse> {
    const record = this.sessions.get(sessionId);

    if (!record) {
      throw new SessionNotFoundError(sessionId);
    }

    if (record.pendingTurn) {
      throw new SessionBusyError(sessionId);
    }

    const turnPromise = this.runChatTurn(record, message);
    record.pendingTurn = turnPromise;

    try {
      return await turnPromise;
    } finally {
      if (record.pendingTurn === turnPromise) {
        record.pendingTurn = null;
      }
    }
  }

  private async createResourceLoader(cwd: string) {
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      appendSystemPromptOverride: () => [LISTENING_LAB_PROMPT],
    });

    await resourceLoader.reload();
    return resourceLoader;
  }

  private buildSessionResponse(record: SessionRecord): LabSessionResponse {
    const environment = getPiEnvironmentStatus();
    const warning =
      record.modelWarning ??
      (!record.session.model && environment.warning ? environment.warning : null);

    return {
      sessionId: record.sessionId,
      piSessionId: record.session.sessionId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      workspacePath: toRepoRelativePath(record.paths.workspaceDir),
      recordsPath: toRepoRelativePath(record.paths.recordsDir),
      sessionFilePath: record.session.sessionFile
        ? toRepoRelativePath(record.session.sessionFile)
        : null,
      agent: {
        ready: Boolean(record.session.model),
        currentModel: serializeModel(record.session.model),
        preferredModel: environment.preferredModel,
        availableModelCount: environment.availableModelCount,
        warning,
      },
      api: {
        createSession: "/api/session",
        chat: "/api/chat",
        chatRequestShape: {
          sessionId: "string",
          message: "string",
        },
        chatResponseShape: {
          sessionId: "string",
          assistantText: "string",
          audioItems: "array",
          meta: "object",
        },
      },
    };
  }

  private async ensureSessionModel(record: SessionRecord) {
    if (record.session.model) {
      return;
    }

    const services = refreshPiServices();
    const preferredModel = pickPreferredModel(services.modelRegistry.getAvailable());
    const environment = getPiEnvironmentStatus();

    if (!preferredModel) {
      throw new ModelUnavailableError(NO_MODEL_MESSAGE, environment);
    }

    await record.session.setModel(preferredModel);

    if (!preferredModel.reasoning) {
      record.session.setThinkingLevel("off");
    }

    record.modelWarning = null;
  }

  private async runChatTurn(
    record: SessionRecord,
    message: string,
  ): Promise<LabChatResponse> {
    await this.ensureSessionModel(record);

    let assistantText = "";
    const audioItems = new Map<string, LabAudioItem>();
    let toolCalls = 0;
    const startedAt = performance.now();
    const unsubscribe = record.session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        assistantText += event.assistantMessageEvent.delta;
      }

      if (event.type === "tool_execution_start") {
        toolCalls += 1;
      }

      if (event.type === "tool_execution_end" && !event.isError) {
        const audioItem = extractAudioItemFromToolResult(event.toolName, event.result);

        if (audioItem) {
          audioItems.set(audioItem.id, audioItem);
        }
      }
    });

    try {
      await record.session.prompt(message);
    } catch (error) {
      const environment = getPiEnvironmentStatus();
      const detail = error instanceof Error ? error.message : null;
      const userFacingMessage =
        detail &&
        /no model|api key|auth|login/i.test(detail) &&
        environment.availableModelCount === 0
          ? NO_MODEL_MESSAGE
          : detail ?? "The embedded pi session failed while handling this turn.";

      if (environment.availableModelCount === 0) {
        throw new ModelUnavailableError(userFacingMessage, environment);
      }

      throw new Error(userFacingMessage);
    } finally {
      unsubscribe();
    }

    const updatedAt = new Date().toISOString();
    record.updatedAt = updatedAt;

    const finalAssistantText =
      assistantText.trim() || getLastAssistantText(record.session.messages);

    return {
      sessionId: record.sessionId,
      assistantText:
        finalAssistantText ||
        "The pi agent finished the turn without returning assistant text.",
      audioItems: [...audioItems.values()],
      meta: {
        piSessionId: record.session.sessionId,
        model: serializeModel(record.session.model),
        elapsedMs: Math.round(performance.now() - startedAt),
        toolCalls,
        messageCount: record.session.messages.length,
        updatedAt,
        workspacePath: toRepoRelativePath(record.paths.workspaceDir),
        sessionFilePath: record.session.sessionFile
          ? toRepoRelativePath(record.session.sessionFile)
          : null,
      },
    };
  }
}

declare global {
  var __piListeningLabSessionStore: LabSessionStore | undefined;
}

function getStore() {
  if (!globalThis.__piListeningLabSessionStore) {
    globalThis.__piListeningLabSessionStore = new LabSessionStore();
  }

  return globalThis.__piListeningLabSessionStore;
}

function extractAssistantText(message: unknown) {
  if (!message || typeof message !== "object") {
    return "";
  }

  if (!("role" in message) || message.role !== "assistant") {
    return "";
  }

  if (!("content" in message) || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter(
      (content): content is { type: "text"; text: string } =>
        Boolean(
          content &&
            typeof content === "object" &&
            "type" in content &&
            content.type === "text" &&
            "text" in content &&
            typeof content.text === "string",
        ),
    )
    .map((content) => content.text)
    .join("")
    .trim();
}

function getLastAssistantText(messages: AgentSession["messages"]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractAssistantText(messages[index]);

    if (text) {
      return text;
    }
  }

  return "";
}

function extractAudioItemFromToolResult(toolName: string, result: unknown) {
  if (toolName !== synthesizeSpeechTool.name || !result || typeof result !== "object") {
    return null;
  }

  const details =
    "details" in result ? (result.details as SynthesizeSpeechToolDetails | undefined) : undefined;
  const audioItem = details?.audioItem;

  if (!audioItem) {
    return null;
  }

  return audioItem;
}

export async function createLabSession() {
  return getStore().createSession();
}

export async function chatWithLabSession(sessionId: string, message: string) {
  return getStore().chat(sessionId, message);
}

export function getLabBackendOverview(): LabBackendOverview {
  return {
    activeSessions: getStore().size,
    dataRootPath: toRepoRelativePath(getDataRoot()),
    environment: getPiEnvironmentStatus(),
  };
}
