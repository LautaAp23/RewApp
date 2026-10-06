import { getFxTable } from "@/lib/fx";

/** Simulated FX table: units of each currency per 1 USD (USDr). */
export async function GET(): Promise<Response> {
  const table = await getFxTable();
  return Response.json(
    { ...table, simulated: true },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
