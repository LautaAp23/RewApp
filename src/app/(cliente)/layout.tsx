"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { ConfirmIdentity } from "@/components/confirm-identity";
import { useAccount } from "@/lib/account/account-context";

/** Signed-in client area: asks "Confirmá que sos vos" when the session expired. */
export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [resuming, setResuming] = useState(false);
  const signedOut = account.ready && account.status === "signed-out";

  useEffect(() => {
    // Back to the same screen after signing in (e.g. a QR opened with the native camera).
    if (signedOut) router.replace(`/?next=${encodeURIComponent(pathname)}`);
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-5 pt-6 pb-32">
      {children}
      <BottomNav />
    </div>
  );
}
