/** Charge id from a RewApp QR (`https://<host>/pagar/<id>`), or null. */
export function chargeFromQr(text: string, origin: string): string | null {
  try {
    const match = new URL(text, origin).pathname.match(/^\/pagar\/([A-Za-z0-9_-]+)\/?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
