export interface ModelSummary {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
}

export interface PiEnvironmentStatus {
  ready: boolean;
  availableModelCount: number;
  availableModels: ModelSummary[];
  preferredModel: ModelSummary | null;
  warning: string | null;
}

export const AUDIO_FORMATS = [
  "mp3",
  "wav",
  "opus",
  "aac",
  "flac",
  "pcm",
] as const;

export type AudioFormat = (typeof AUDIO_FORMATS)[number];

export interface LabAudioItem {
  id: string;
  url: string;
  text: string;
  voice: string;
  format: AudioFormat;
  createdAt: string;
  durationMs: number | null;
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

export interface LabApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
  meta?: {
    availableModelCount?: number;
    preferredModel?: ModelSummary | null;
    warning?: string | null;
  };
}
