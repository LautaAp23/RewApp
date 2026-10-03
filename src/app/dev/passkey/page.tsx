"use client";

import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
} from "@category-labs/mera";
import { useEffect, useState } from "react";
import {
  accountFromPrfOutput,
  getRpId,
  type PasskeyAccount,
} from "@/lib/account/derive";

type Result = { address: string; credentialId: string; via: string };

export default function PasskeyPoc() {
  const [rpId, setRpId] = useState("");
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => setRpId(getRpId()), []);

  async function run(
    via: string,
    ceremony: () => Promise<{ credentialId: string; prfOutput: Uint8Array }>,
  ) {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    let account: PasskeyAccount | undefined;
    try {
      const { credentialId, prfOutput } = await ceremony();
      account = accountFromPrfOutput(prfOutput);
      setResult({ address: account.address, credentialId, via });
    } catch (e) {
      setError(isMeraError(e) ? `${e.code}: ${e.message}` : String(e));
    } finally {
      account?.session.end();
      setBusy(false);
    }
  }

  const create = () =>
    run("Crear", () =>
      createPasskeyWithPrfOutput({
        rp: { id: rpId, name: "RewApp" },
        user: {
          name: "rewapp-poc",
          displayName: `RewApp POC ${new Date().toLocaleString()}`,
        },
      }),
    );

  const signIn = () => run("Ingresar", () => getPasskeyPrfOutput({ rpId }));

  function clearStorage() {
    localStorage.clear();
    sessionStorage.clear();
    setResult(undefined);
    setError(undefined);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-bold">POC passkey (LAU-8)</h1>
      <p className="text-sm text-neutral-500">
        rpId: <code>{rpId}</code>
      </p>
      <button
        className="min-h-12 rounded-xl bg-indigo-600 px-4 font-semibold text-white disabled:opacity-50"
        disabled={busy || !rpId}
        onClick={signIn}
      >
        Ingresar con mi passkey
      </button>
      <button
        className="min-h-12 rounded-xl border border-neutral-400 px-4 font-semibold disabled:opacity-50"
        disabled={busy || !rpId}
        onClick={create}
      >
        Crear passkey nueva
      </button>
      <button
        className="min-h-12 rounded-xl px-4 text-sm underline"
        onClick={clearStorage}
      >
        Borrar storage del sitio
      </button>
      {result && (
        <section className="break-all rounded-xl bg-neutral-100 p-4 text-sm dark:bg-neutral-800">
          <p>Acción: {result.via}</p>
          <p className="mt-2 font-mono text-base">{result.address}</p>
          <p className="mt-2 text-neutral-500">
            credentialId: {result.credentialId}
          </p>
        </section>
      )}
      {error && <p className="break-all text-sm text-red-600">{error}</p>}
    </main>
  );
}
