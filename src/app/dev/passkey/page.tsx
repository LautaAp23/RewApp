"use client";

import {
  decryptSecretVaultWithPasskey,
  isMeraError,
  type PasskeySecretVault,
} from "@category-labs/mera";
import { useEffect, useState } from "react";
import { useAccount } from "@/lib/account/account-context";
import { accountFromEntropy, getRpId } from "@/lib/account/derive";
import {
  type AccountEntropy,
  addBackupPasskey,
  createAccountPasskey,
  getAccountEntropy,
} from "@/lib/account/passkey-flows";

function describeError(error: unknown): string {
  return isMeraError(error) ? `${error.code}: ${error.message}` : String(error);
}

function tamper(vault: PasskeySecretVault): PasskeySecretVault {
  const first = vault.ciphertext[0] === "A" ? "B" : "A";
  return { ...vault, ciphertext: first + vault.ciphertext.slice(1) };
}

function AccountModuleCheck() {
  const account = useAccount();
  const [signature, setSignature] = useState<string>();
  const busy = account.status === "busy";
  const buttonClass =
    "min-h-12 rounded-button border border-elevated px-4 font-semibold disabled:opacity-50";

  async function sign() {
    setSignature(
      await account.getSigner().signMessage({ message: "RewApp RA-12" }),
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card border border-elevated p-4">
      <h2 className="text-lg font-bold">Módulo de cuenta (RA-12)</h2>
      <p className="break-all text-sm text-muted">
        Estado: {account.status}
        {account.address && ` · ${account.address} (${account.kind})`}
        {account.hasCredentialHint && " · hay pista de passkey"}
      </p>
      {account.error && (
        <p role="alert" className="text-sm text-error">
          {account.error}
        </p>
      )}
      {account.status === "signed-in" ? (
        <>
          <button className={buttonClass} disabled={busy} onClick={sign}>
            Firmar mensaje de prueba
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={account.addBackupPasskey}
          >
            Agregar passkey de respaldo
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={account.endSession}
          >
            Cerrar sesión
          </button>
        </>
      ) : (
        <>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={account.signIn}
          >
            Ingresar con mi passkey
          </button>
          <button
            className={buttonClass}
            disabled={busy}
            onClick={account.createAccount}
          >
            Crear una cuenta nueva
          </button>
        </>
      )}
      {signature && (
        <p className="break-all font-mono text-xs">firma: {signature}</p>
      )}
    </section>
  );
}

export default function PasskeyPoc() {
  const [rpId, setRpId] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [backupVault, setBackupVault] = useState<PasskeySecretVault>();

  useEffect(() => setRpId(getRpId()), []);

  async function run(label: string, action: () => Promise<string>) {
    setBusy(true);
    try {
      const line = await action();
      setLog((previous) => [`${label}: ${line}`, ...previous]);
    } catch (error) {
      setLog((previous) => [
        `${label}: ERROR ${describeError(error)}`,
        ...previous,
      ]);
    } finally {
      setBusy(false);
    }
  }

  function showAccount({ entropy, credentialId, kind }: AccountEntropy) {
    const account = accountFromEntropy(entropy);
    entropy.fill(0);
    account.session.end();
    return `${account.address} (passkey ${kind}, ${credentialId.slice(0, 8)}…)`;
  }

  const signIn = () =>
    run("Ingresar", async () => showAccount(await getAccountEntropy(rpId)));

  const create = () =>
    run("Crear", async () => showAccount(await createAccountPasskey(rpId)));

  const addBackup = () =>
    run("Respaldo", async () => {
      const primary = await getAccountEntropy(rpId);
      try {
        if (primary.kind !== "principal") {
          throw new Error("Elegí la passkey principal, no la de respaldo");
        }
        const vault = await addBackupPasskey(rpId, primary.entropy);
        setBackupVault(vault);
        return `vault guardado para ${vault.credential.credentialId.slice(0, 8)}…`;
      } finally {
        primary.entropy.fill(0);
      }
    });

  const tryTamperedVault = () =>
    run("Vault adulterado", async () => {
      if (!backupVault) throw new Error("Primero agregá un respaldo");
      const secret = await decryptSecretVaultWithPasskey({
        rpId,
        vault: tamper(backupVault),
      });
      secret.fill(0);
      return "FALLÓ LA PRUEBA: el vault adulterado se descifró";
    });

  function clearStorage() {
    localStorage.clear();
    sessionStorage.clear();
    setLog((previous) => ["Storage borrado", ...previous]);
  }

  const buttonClass =
    "min-h-12 rounded-button border border-elevated px-4 font-semibold disabled:opacity-50";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-6">
      <h1 className="text-2xl font-bold">POC passkey (LAU-8, LAU-9)</h1>
      <p className="text-sm text-muted">
        rpId: <code>{rpId}</code>
      </p>
      <button
        className="min-h-12 rounded-button bg-primary px-4 font-semibold text-on-primary shadow-glow active:bg-primary-pressed disabled:opacity-50"
        disabled={busy || !rpId}
        onClick={signIn}
      >
        Ingresar con mi passkey
      </button>
      <button className={buttonClass} disabled={busy || !rpId} onClick={create}>
        Crear passkey nueva
      </button>
      <button
        className={buttonClass}
        disabled={busy || !rpId}
        onClick={addBackup}
      >
        Agregar passkey de respaldo
      </button>
      <button
        className={buttonClass}
        disabled={busy || !backupVault}
        onClick={tryTamperedVault}
      >
        Probar vault adulterado
      </button>
      <button
        className="min-h-12 rounded-button px-4 text-sm underline"
        onClick={clearStorage}
      >
        Borrar storage del sitio
      </button>
      <AccountModuleCheck />
      <ol className="flex flex-col gap-2 break-all text-sm">
        {log.map((line, index) => (
          <li
            key={log.length - index}
            className="rounded-card border border-elevated bg-surface p-3 font-mono"
          >
            {line}
          </li>
        ))}
      </ol>
    </main>
  );
}
