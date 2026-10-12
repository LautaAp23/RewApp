// Retired public endpoint. Card metadata now requires an owner signature.
export function GET() { return Response.json({ error: "ENDPOINT_RETIRED" }, { status: 410 }); }
export function POST() { return Response.json({ error: "ENDPOINT_RETIRED" }, { status: 410 }); }
