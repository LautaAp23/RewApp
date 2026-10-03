import Image from "next/image";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Image src="/icon-192.png" alt="" width={96} height={96} priority />
      <h1 className="text-[32px] font-bold">RewApp</h1>
      <p className="text-base text-muted">
        Pagá con QR y ganá recompensas al instante, en tu moneda.
      </p>
      <span className="rounded-full bg-reward/15 px-3 py-1 text-xs font-bold tracking-widest text-reward uppercase">
        Muy pronto
      </span>
    </main>
  );
}
