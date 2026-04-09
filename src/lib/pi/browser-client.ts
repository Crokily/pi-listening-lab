"use client";

import type {
  LabApiErrorPayload,
  LabChatResponse,
  LabSessionResponse,
} from "@/lib/pi/contracts";

let cachedSession: LabSessionResponse | null = null;
let cachedSessionPromise: Promise<LabSessionResponse> | null = null;

export class PiLabApiError extends Error {
  code: string;
  status: number;
  meta: LabApiErrorPayload["meta"];

  constructor({
    code,
    message,
    status,
    meta,
  }: {
    code: string;
    message: string;
    status: number;
    meta?: LabApiErrorPayload["meta"];
  }) {
    super(message);
    this.name = "PiLabApiError";
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
}

function isApiErrorPayload(value: unknown): value is LabApiErrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const error =
    "error" in candidate && candidate.error && typeof candidate.error === "object"
      ? (candidate.error as Record<string, unknown>)
      : null;

  return (
    error !== null &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  );
}

async function requestJson<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    if (isApiErrorPayload(payload)) {
      throw new PiLabApiError({
        code: payload.error.code,
        message: payload.error.message,
        status: response.status,
        meta: payload.meta,
      });
    }

    throw new PiLabApiError({
      code: "HTTP_ERROR",
      message: `Request failed with HTTP ${response.status}.`,
      status: response.status,
    });
  }

  return payload as T;
}

export function getCachedLabSession() {
  return cachedSession;
}

export function clearCachedLabSession() {
  cachedSession = null;
  cachedSessionPromise = null;
}

export async function createLabSessionRequest() {
  return requestJson<LabSessionResponse>("/api/session", {
    method: "POST",
    cache: "no-store",
  });
}

export async function getOrCreateLabSession(options?: { force?: boolean }) {
  const force = options?.force ?? false;

  if (force) {
    clearCachedLabSession();
  }

  if (cachedSession) {
    return cachedSession;
  }

  if (!cachedSessionPromise) {
    cachedSessionPromise = createLabSessionRequest()
      .then((session) => {
        cachedSession = session;
        return session;
      })
      .catch((error) => {
        cachedSessionPromise = null;
        throw error;
      });
  }

  return cachedSessionPromise;
}

export async function sendLabChatMessage(input: {
  sessionId: string;
  message: string;
}) {
  return requestJson<LabChatResponse>("/api/chat", {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });
}
