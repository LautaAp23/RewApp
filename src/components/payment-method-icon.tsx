export function PaymentMethodIcon({
  type = "card",
  className = "h-6 w-6",
}: {
  type?: "card" | "balance";
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {type === "card" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M3 10h18M7 15h3" />
        </>
      ) : (
        <>
          <path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7" />
          <path d="M20 12h-4a2 2 0 0 0 0 4h4M7 7h10" />
        </>
      )}
    </svg>
  );
}
