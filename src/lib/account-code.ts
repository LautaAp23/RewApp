import { getAddress, isAddress } from "viem";
export function accountCode(address: string): string {
  const bytes = address
    .slice(2)
    .match(/.{2}/g)!
    .map((v) => String.fromCharCode(parseInt(v, 16)))
    .join("");
  return (
    "RW-" +
    btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  );
}
export function decodeAccountCode(code: string): string | null {
  try {
    if (!/^RW-[A-Za-z0-9_-]{27}$/.test(code.trim())) return null;
    const bytes = atob(
      code.trim().slice(3).replace(/-/g, "+").replace(/_/g, "/"),
    );
    const address =
      "0x" +
      Array.from(bytes, (c) =>
        c.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join("");
    return isAddress(address) ? getAddress(address) : null;
  } catch {
    return null;
  }
}
