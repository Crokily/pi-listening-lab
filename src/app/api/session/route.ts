import { createLabSession } from "@/server/pi/session-store";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await createLabSession();

    return Response.json(session, {
      status: 201,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create a pi listening lab session.";

    return Response.json(
      {
        error: {
          code: "SESSION_CREATE_FAILED",
          message,
        },
      },
      {
        status: 500,
      },
    );
  }
}
