/**
 * Synthesized UI sounds using the Web Audio API — no audio files required.
 *
 * Modelled after Google Meet's soft marimba-like tones:
 *   join:  two ascending notes  D4 → G4  (~293 Hz → ~392 Hz)
 *   leave: two descending notes G4 → D4  (~392 Hz → ~293 Hz)
 *
 * Timbre: blended sine + triangle gives a warm, mellow "wooden bell" quality.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

function playMarimbaTone(
  frequency: number,
  startTime: number,
  duration: number,
  peakGain: number,
): void {
  const ac = getCtx();

  // Two oscillators blended for a marimba-like timbre
  const osc1 = ac.createOscillator();
  const osc2 = ac.createOscillator();
  const gain1 = ac.createGain();
  const gain2 = ac.createGain();
  const master = ac.createGain();

  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(frequency, startTime);

  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(frequency * 2, startTime); // one octave up adds warmth

  // Triangle is quieter — just adds body, not brightness
  gain1.gain.setValueAtTime(0.75, startTime);
  gain2.gain.setValueAtTime(0.25, startTime);

  // Envelope: sharp attack, smooth exponential decay (marimba-like)
  master.gain.setValueAtTime(0, startTime);
  master.gain.linearRampToValueAtTime(peakGain, startTime + 0.008);
  master.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

  osc1.connect(gain1);
  osc2.connect(gain2);
  gain1.connect(master);
  gain2.connect(master);
  master.connect(ac.destination);

  osc1.start(startTime);
  osc2.start(startTime);
  osc1.stop(startTime + duration + 0.05);
  osc2.stop(startTime + duration + 0.05);
}

// D3 → G3  (ascending, "someone joined")
export function playJoinSound(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    playMarimbaTone(146.83, t,        0.45, 0.22); // D3
    playMarimbaTone(196.00, t + 0.15, 0.5,  0.18); // G3
  } catch {
    // AudioContext blocked (e.g. no user gesture yet) — fail silently
  }
}

// G3 → D3  (descending, "someone left")
export function playLeaveSound(): void {
  try {
    const ac = getCtx();
    const t = ac.currentTime;
    playMarimbaTone(196.00, t,        0.45, 0.18); // G3
    playMarimbaTone(146.83, t + 0.15, 0.5,  0.15); // D3
  } catch {
    // fail silently
  }
}
