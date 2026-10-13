"use client";

import { useCallback, useEffect, useState } from "react";

/** Per account and per device, like the notifications. On by default: it only plays after a claim tap. */
const key = (address: string) => `rewapp:streak-sound:${address.toLowerCase()}`;

function readSoundEnabled(address: string | undefined): boolean {
  if (!address || typeof localStorage === "undefined") return true;
  return localStorage.getItem(key(address)) !== "off";
}

function useStreakSound(address: string | undefined) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => setEnabled(readSoundEnabled(address)), [address]);
  const update = useCallback(
    (next: boolean) => {
      setEnabled(next);
      if (address) localStorage.setItem(key(address), next ? "on" : "off");
    },
    [address],
  );
  return [enabled, update] as const;
}

let audio: AudioContext | undefined;

/**
 * Call inside the tap that starts the claim: browsers only let audio start from a user gesture, and
 * the coins play seconds later, after the passkey and the confirmation.
 */
function unlockAudio() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    audio = undefined;
  }
}

/** A short cascade of coins, synthesized (no asset to download). iOS mutes it with the silent switch. */
function playCoins() {
  if (!audio || audio.state !== "running") return;
  const start = audio.currentTime + 0.02;
  for (let i = 0; i < 9; i++) {
    const at = start + i * 0.07 + Math.random() * 0.03;
    for (const [frequency, gain] of [[1975, 0.16], [2637, 0.1]] as const) {
      const osc = audio.createOscillator();
      const env = audio.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency * (1 + (Math.random() - 0.5) * 0.06), at);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(gain, at + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(env).connect(audio.destination);
      osc.start(at);
      osc.stop(at + 0.25);
    }
  }
}

export { playCoins, readSoundEnabled, unlockAudio, useStreakSound };
