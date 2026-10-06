/** Merchant logo, or its initial while there is none. */
export function MerchantAvatar({ name, logoUrl, size = 40 }: { name: string; logoUrl: string | null; size?: number }) {
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-elevated bg-cover bg-center font-bold text-text"
      style={{ width: size, height: size, backgroundImage: logoUrl ? `url(${JSON.stringify(logoUrl)})` : undefined }}
    >
      {logoUrl ? null : name.slice(0, 1).toUpperCase()}
    </div>
  );
}
