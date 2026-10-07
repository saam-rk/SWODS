export const dynamic = "force-dynamic";

const TIMEOUT_MS = 4_000;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return readinessResponse("not_ready", "configuration", 503);

  try {
    const response = await fetch(new URL("/auth/v1/health", url), {
      cache: "no-store",
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return readinessResponse("not_ready", "supabase", 503);
  } catch {
    return readinessResponse("not_ready", "supabase", 503);
  }

  return readinessResponse("ready", "none", 200);
}

function readinessResponse(status: "ready" | "not_ready", dependency: "none" | "configuration" | "supabase", responseStatus: number) {
  return Response.json(
    { status, dependency, timestamp: new Date().toISOString() },
    { status: responseStatus, headers: { "Cache-Control": "no-store" } },
  );
}
