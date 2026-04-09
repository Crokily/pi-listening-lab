import "server-only";

import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@sinclair/typebox";

import {
  normalizeAudioMimeType,
  saveGeneratedAudio,
  type AudioFormat,
  type LabAudioItem,
} from "@/server/pi/audio-store";

const DEFAULT_KOKORO_BASE_URL = "http://127.0.0.1:8880";
const DEFAULT_KOKORO_MODEL = "kokoro";
const DEFAULT_KOKORO_VOICE = "af_bella";
const DEFAULT_AUDIO_FORMAT = "mp3";

const SYNTHESIZE_SPEECH_PARAMS = Type.Object({
  text: Type.String({
    description: "The exact text to synthesize into speech.",
    minLength: 1,
    maxLength: 5000,
  }),
  voice: Type.Optional(
    Type.String({
      description: `Optional Kokoro voice. Defaults to ${DEFAULT_KOKORO_VOICE} or KOKORO_VOICE.`,
      minLength: 1,
    }),
  ),
  speed: Type.Optional(
    Type.Number({
      description: "Optional playback speed multiplier, usually between 0.5 and 2.0.",
      minimum: 0.5,
      maximum: 2,
    }),
  ),
  format: Type.Optional(
    Type.Union([
      Type.Literal("mp3"),
      Type.Literal("wav"),
      Type.Literal("opus"),
      Type.Literal("aac"),
      Type.Literal("flac"),
      Type.Literal("pcm"),
    ], {
      description: "Optional output audio format. Defaults to mp3.",
    }),
  ),
});

type SynthesizeSpeechParams = Static<typeof SYNTHESIZE_SPEECH_PARAMS>;

export interface SynthesizeSpeechToolDetails {
  audioItem: LabAudioItem;
}

interface KokoroConfig {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  voice: string;
}

function resolveKokoroConfig(): KokoroConfig {
  const rawBaseUrl = process.env.KOKORO_BASE_URL?.trim() || DEFAULT_KOKORO_BASE_URL;
  const voice = process.env.KOKORO_VOICE?.trim() || DEFAULT_KOKORO_VOICE;
  const model = process.env.KOKORO_MODEL?.trim() || DEFAULT_KOKORO_MODEL;
  const apiKey = process.env.KOKORO_API_KEY?.trim() || null;

  let baseUrl: string;

  try {
    baseUrl = new URL(rawBaseUrl).toString().replace(/\/$/, "");
  } catch {
    throw new Error(
      "Speech synthesis is not configured correctly. Set KOKORO_BASE_URL to a valid Kokoro-FastAPI URL.",
    );
  }

  return {
    apiKey,
    baseUrl,
    model,
    voice,
  };
}

async function readUpstreamError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        detail?: string;
        error?: {
          message?: string;
        };
        message?: string;
      };

      return (
        payload.error?.message?.trim() ||
        payload.detail?.trim() ||
        payload.message?.trim() ||
        null
      );
    }

    const text = (await response.text()).trim();
    return text || null;
  } catch {
    return null;
  }
}

async function requestSpeech(
  params: SynthesizeSpeechParams,
  signal: AbortSignal | undefined,
) {
  const config = resolveKokoroConfig();
  const format = (params.format ?? DEFAULT_AUDIO_FORMAT) as AudioFormat;
  const text = params.text.trim();
  const voice = params.voice?.trim() || config.voice;

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  let response: Response;

  try {
    response = await fetch(`${config.baseUrl}/v1/audio/speech`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        input: text,
        voice,
        response_format: format,
        ...(typeof params.speed === "number" ? { speed: params.speed } : {}),
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }

    throw new Error(
      `Speech synthesis is unavailable right now. Start Kokoro-FastAPI at ${config.baseUrl} or check KOKORO_BASE_URL.`,
    );
  }

  if (!response.ok) {
    const detail = await readUpstreamError(response);

    throw new Error(
      detail
        ? `Kokoro rejected the speech request: ${detail}`
        : `Kokoro could not synthesize speech right now (HTTP ${response.status}).`,
    );
  }

  const audio = await response.arrayBuffer();
  const metadata = await saveGeneratedAudio({
    audio,
    text,
    voice,
    format,
    mimeType: normalizeAudioMimeType(format, response.headers.get("content-type")),
  });

  return {
    audioItem: {
      id: metadata.id,
      url: metadata.url,
      text: metadata.text,
      voice: metadata.voice,
      format: metadata.format,
      createdAt: metadata.createdAt,
      durationMs: metadata.durationMs,
    } satisfies LabAudioItem,
  } satisfies SynthesizeSpeechToolDetails;
}

export const synthesizeSpeechTool = defineTool({
  name: "synthesize_speech",
  label: "Synthesize Speech",
  description:
    "Generate spoken audio for learner-facing text by calling the Kokoro-FastAPI speech endpoint and saving the result for in-browser playback.",
  promptSnippet:
    "synthesize_speech(text, voice?, speed?, format?) generates audio only when the user explicitly wants to hear text.",
  promptGuidelines: [
    "Use synthesize_speech only when the user explicitly asks to hear text or wants playable audio.",
    "Do not synthesize audio by default while brainstorming, planning, or revising corpus.",
    "Prefer short, clearly selected passages unless the user asks for a longer recording.",
  ],
  parameters: SYNTHESIZE_SPEECH_PARAMS,
  async execute(_toolCallId, params, signal) {
    const result = await requestSpeech(params, signal);

    return {
      content: [
        {
          type: "text",
          text: `Audio ready as ${result.audioItem.id} using voice ${result.audioItem.voice} in ${result.audioItem.format} format.`,
        },
      ],
      details: result,
    };
  },
});
