import "server-only";

import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

import { ensureDataDirectories, getAudioRoot } from "@/server/pi/paths";

export const AUDIO_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AUDIO_FORMATS = ["mp3", "wav", "opus", "aac", "flac", "pcm"] as const;

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

export interface StoredAudioMetadata extends LabAudioItem {
  byteLength: number;
  fileName: string;
  mimeType: string;
}

export interface SaveGeneratedAudioInput {
  audio: ArrayBuffer;
  text: string;
  voice: string;
  format: AudioFormat;
  mimeType: string;
}

const FORMAT_TO_MIME_TYPE: Record<AudioFormat, string> = {
  aac: "audio/aac",
  flac: "audio/flac",
  mp3: "audio/mpeg",
  opus: "audio/opus",
  pcm: "audio/pcm",
  wav: "audio/wav",
};

function getMetadataPath(audioId: string) {
  return join(getAudioRoot(), `${audioId}.json`);
}

function getAudioPath(fileName: string) {
  const safeFileName = basename(fileName);

  if (safeFileName !== fileName) {
    throw new Error("Stored audio metadata points outside the audio directory.");
  }

  const audioPath = join(getAudioRoot(), safeFileName);
  const relativePath = relative(getAudioRoot(), audioPath);

  if (relativePath.startsWith("..")) {
    throw new Error("Stored audio metadata points outside the audio directory.");
  }

  return audioPath;
}

function isAudioFormat(value: unknown): value is AudioFormat {
  return (
    typeof value === "string" &&
    AUDIO_FORMATS.includes(value as AudioFormat)
  );
}

function isStoredAudioMetadata(value: unknown): value is StoredAudioMetadata {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.id === "string" &&
    AUDIO_ID_PATTERN.test(candidate.id) &&
    typeof candidate.url === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.voice === "string" &&
    isAudioFormat(candidate.format) &&
    typeof candidate.createdAt === "string" &&
    candidate.durationMs === null &&
    typeof candidate.byteLength === "number" &&
    Number.isFinite(candidate.byteLength) &&
    candidate.byteLength >= 0 &&
    typeof candidate.fileName === "string" &&
    typeof candidate.mimeType === "string"
  );
}

export function isValidAudioId(audioId: string) {
  return AUDIO_ID_PATTERN.test(audioId.trim());
}

export function normalizeAudioMimeType(
  format: AudioFormat,
  mimeType: string | null | undefined,
) {
  const normalizedMimeType = mimeType?.trim();

  return normalizedMimeType || FORMAT_TO_MIME_TYPE[format];
}

export async function saveGeneratedAudio(
  input: SaveGeneratedAudioInput,
): Promise<StoredAudioMetadata> {
  await ensureDataDirectories();

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const buffer = Buffer.from(input.audio);
  const fileName = `${id}.${input.format}`;
  const metadata: StoredAudioMetadata = {
    id,
    url: `/api/audio/${id}`,
    text: input.text,
    voice: input.voice,
    format: input.format,
    createdAt,
    durationMs: null,
    byteLength: buffer.byteLength,
    fileName,
    mimeType: normalizeAudioMimeType(input.format, input.mimeType),
  };

  await Promise.all([
    writeFile(getAudioPath(fileName), buffer),
    writeFile(
      getMetadataPath(id),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8",
    ),
  ]);

  return metadata;
}

export async function readStoredAudioMetadata(
  audioId: string,
): Promise<StoredAudioMetadata | null> {
  const normalizedId = audioId.trim();

  if (!isValidAudioId(normalizedId)) {
    return null;
  }

  try {
    const raw = await readFile(getMetadataPath(normalizedId), "utf8");
    const parsed: unknown = JSON.parse(raw);

    if (!isStoredAudioMetadata(parsed)) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function readStoredAudioFile(audioId: string) {
  const metadata = await readStoredAudioMetadata(audioId);

  if (!metadata) {
    return null;
  }

  try {
    const audio = await readFile(getAudioPath(metadata.fileName));
    return {
      metadata,
      audio,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}
