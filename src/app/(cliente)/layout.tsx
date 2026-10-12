"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";
import { BottomNav } from "@/components/bottom-nav";
import { ReceiptOverlayProvider } from "@/components/receipt-overlay";
import { ConfirmIdentity } from "@/components/confirm-identity";
import { useAccount } from "@/lib/account/account-context";
import { isRegisterChargePath, registerChargePath } from "@/lib/register-lock";
import { useRegisterLock } from "@/lib/use-register-lock";

/** Signed-in client area: asks "Confirmá que sos vos" when the session expired. */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [resuming, setResuming] = useState(false);
  const lock = useRegisterLock();
  const signedOut = account.ready && account.status === "signed-out";

  useEffect(() => {
    if (!account.ready || signedOut || !lock || isRegisterChargePath(pathname, lock)) return;
    router.replace(registerChargePath(lock));
  }, [account.ready, signedOut, lock, pathname, router]);

  useEffect(() => {
    // Back to the same screen after signing in (e.g. a QR opened with the native camera).
    if (signedOut) router.replace(`/?next=${encodeURIComponent(pathname + window.location.search + window.location.hash)}`);
  }, [signedOut, router, pathname]);

  useEffect(() => {
    if (account.status === "expired") setResuming(true);
    else if (account.status !== "busy") setResuming(false);
  }, [account.status]);

  if (!account.ready || signedOut) return null;
  if (account.status === "expired" || (resuming && account.status === "busy")) {
    return <ConfirmIdentity />;
  }
  return (
    <div className={`client-shell mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-6 ${lock ? "pb-6" : "pb-32"}`}>
      <ReceiptOverlayProvider>
        <AppHeader />
        {/* Re-keyed per route so every screen enters with the same short fade. */}
        <div key={pathname} className="animate-enter flex min-h-0 flex-1 flex-col">
          {children}
        </div>
        {lock ? null : <BottomNav />}
      </ReceiptOverlayProvider>
    </div>
  );
}
