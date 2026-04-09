import { readStoredAudioFile } from "@/server/pi/audio-store";

export const runtime = "nodejs";

function notFound() {
  return Response.json(
    {
      error: {
        code: "AUDIO_NOT_FOUND",
        message: "Audio was not found for this id.",
      },
    },
    {
      status: 404,
    },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ audioId: string }> },
) {
  const { audioId } = await params;
  const storedAudio = await readStoredAudioFile(audioId);

  if (!storedAudio) {
    return notFound();
  }

  return new Response(storedAudio.audio, {
    headers: {
      "cache-control": "private, no-store",
      "content-length": String(storedAudio.metadata.byteLength),
      "content-type": storedAudio.metadata.mimeType,
      "x-content-type-options": "nosniff",
    },
  });
}
