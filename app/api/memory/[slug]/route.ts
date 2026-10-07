import { NextResponse } from "next/server";

import { isMemoryToken } from "@/lib/supabase/memory-links";
import { resolvePublicMemory } from "@/lib/supabase/memory-server";

export const dynamic = "force-dynamic";

const RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 2_048) return response({ error: "Invalid request." }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response({ error: "Invalid request." }, 400);
  }

  const { slug } = await context.params;
  const token = body && typeof body === "object" ? (body as { token?: unknown }).token : null;
  const requestedLocale = body && typeof body === "object" ? (body as { locale?: unknown }).locale : null;
  const locale = requestedLocale === "es" || requestedLocale === "it" ? requestedLocale : "en";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !isMemoryToken(token)) {
    return response({ error: "This memory link is invalid or unavailable." }, 404);
  }

  try {
    const experience = await resolvePublicMemory(slug, token, locale);
    if (!experience) return response({ error: "This memory link is invalid or unavailable." }, 404);
    return response({ experience }, 200);
  } catch (error) {
    console.error("Memory link resolution failed", error instanceof Error ? error.message : "Unknown error");
    return response({ error: "The memory could not be loaded." }, 503);
  }
}

function response(body: object, status: number) {
  return NextResponse.json(body, { status, headers: RESPONSE_HEADERS });
}
