"use client";

import Image from "next/image";
import { useState } from "react";
import { useAccount } from "@/lib/account/account-context";

const primaryButton =
  "min-h-12 w-full rounded-button bg-primary px-6 py-3 font-bold text-on-primary active:bg-primary-pressed disabled:opacity-50";
const secondaryButton =
  "min-h-12 w-full rounded-button border border-elevated px-6 py-3 font-semibold text-text active:bg-surface disabled:opacity-50";

export default function Home() {
  const account = useAccount();
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const busy = account.status === "busy";

  if (account.status === "signed-in") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
        <Image src="/icon-192.png" alt="" width={96} height={96} priority />
        <h1 className="text-[32px] font-bold">¡Hola!</h1>
        <p className="text-base text-muted">
          Entraste a RewApp. Estamos armando tu saldo y tus recompensas.
        </p>
        <button
          className={secondaryButton}
          onClick={() => {
            setConfirmingCreate(false);
            account.endSession();
          }}
        >
          Cerrar sesión
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-[32px] font-bold">RewApp</h1>
      <p className="text-base text-muted">
        Pagá y ganá recompensas en tus comercios favoritos.
      </p>

      {account.error ? (
        <div
          role="alert"
          className="flex w-full flex-col gap-3 rounded-card border border-elevated bg-surface p-4"
        >
          <p className="text-sm text-error">{account.error}</p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            {busy ? "Esperando tu huella…" : "Reintentar"}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            Usar otro dispositivo
          </button>
          <p className="text-xs text-muted">
            En la próxima pantalla elegí la opción para usar la passkey de otro
            celular o una llave de seguridad.
          </p>
        </div>
      ) : confirmingCreate ? (
        <div className="flex w-full flex-col gap-3">
          <p className="text-sm text-muted">
            Si ya tenías una cuenta, ingresá con tu passkey anterior para
            acceder a tu saldo.
          </p>
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.createAccount}
          >
            {busy ? "Esperando tu huella…" : "Crear cuenta"}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() => setConfirmingCreate(false)}
          >
            Volver
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-col gap-3">
          <button
            className={primaryButton}
            disabled={busy}
            onClick={account.signIn}
          >
            {busy ? "Esperando tu huella…" : "Ingresar con mi passkey"}
          </button>
          <button
            className={secondaryButton}
            disabled={busy}
            onClick={() => setConfirmingCreate(true)}
          >
            Crear una cuenta nueva
          </button>
        </div>
      )}
    </main>
  );
}
