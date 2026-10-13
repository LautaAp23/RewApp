"use client";

/** localStorage switch of the till sound. Silent unless the cashier opts in. */
export const CHARGE_SOUND_KEY = "rewapp-charge-sound";

export function readChargeSound(): boolean {
  try {
    return window.localStorage.getItem(CHARGE_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeChargeSound(on: boolean): void {
  try {
    window.localStorage.setItem(CHARGE_SOUND_KEY, on ? "1" : "0");
  } catch {
    // Private mode: the till simply stays silent.
  }
}

/** Short WebAudio beep for the payment confirmation. No assets, no vibration. */
export function playChargeBeep(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.5, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
    oscillator.onended = () => void context.close().catch(() => undefined);
  } catch {
    // No audio device: the visual confirmation is enough.
  }
}
