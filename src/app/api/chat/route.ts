import {
  ModelUnavailableError,
  SessionBusyError,
  SessionNotFoundError,
  chatWithLabSession,
} from "@/server/pi/session-store";

export const runtime = "nodejs";

interface ChatRequestBody {
  sessionId?: unknown;
  message?: unknown;
}

function badRequest(message: string) {
  return Response.json(
    {
      error: {
        code: "BAD_REQUEST",
        message,
      },
    },
    {
      status: 400,
    },
  );
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!sessionId) {
    return badRequest("`sessionId` is required.");
  }

  if (!message) {
    return badRequest("`message` must be a non-empty string.");
  }

  try {
    const response = await chatWithLabSession(sessionId, message);
    return Response.json(response);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return Response.json(
        {
          error: {
            code: "SESSION_NOT_FOUND",
            message: error.message,
          },
        },
        {
          status: 404,
        },
      );
    }

    if (error instanceof SessionBusyError) {
      return Response.json(
        {
          error: {
            code: "SESSION_BUSY",
            message: error.message,
          },
        },
        {
          status: 409,
        },
      );
    }

    if (error instanceof ModelUnavailableError) {
      return Response.json(
        {
          error: {
            code: "MODEL_UNAVAILABLE",
            message: error.message,
          },
          meta: {
            availableModelCount: error.status.availableModelCount,
            preferredModel: error.status.preferredModel,
            warning: error.status.warning,
          },
        },
        {
          status: 503,
        },
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "The pi session failed while handling this chat turn.";

    return Response.json(
      {
        error: {
          code: "CHAT_FAILED",
          message,
        },
      },
      {
        status: 500,
      },
    );
  }
}
