import { normalizePhoton, type PlaceSuggestion } from "@/lib/places";

const PHOTON = "https://photon.komoot.io/api/";
// Photon's usage policy asks clients to identify themselves.
const USER_AGENT = "RewApp/0.1 (https://rewapp-app.vercel.app)";
const LIMIT = 6;
const TIMEOUT_MS = 6_000;

/**
 * Place search for the merchant sign-up, proxied on purpose: it keeps the
 * User-Agent in one place, avoids CORS, and isolates a future swap to another
 * provider. A failure here is NOT fatal — the form stays usable by hand — so
 * every error answers 200 with an empty list plus `available: false`.
 */
export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return Response.json({ places: [], available: true });

  const url = new URL(PHOTON);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(LIMIT));
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return Response.json({ places: [], available: false });
    const body = (await response.json()) as { features?: unknown[] };
    const places = (body.features ?? [])
      .map((feature) => normalizePhoton(feature as never))
      .filter((place): place is PlaceSuggestion => Boolean(place));
    return Response.json({ places, available: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ places: [], available: false });
  }
}
