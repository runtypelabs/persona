import type { VoiceProvider, VoiceStatus } from "@runtypelabs/persona";

/** Deterministic, silent voice turn. Never accesses audio devices or a network. */
export function createDemoVoiceProvider(): VoiceProvider & { setMuted(muted: boolean): void } {
  let muted = false;
  let active = false;
  let turn = 0;
  let statusChanged: (status: VoiceStatus) => void = () => {};
  let transcript: Parameters<NonNullable<VoiceProvider["onTranscript"]>>[0] = () => {};
  let levelChanged: (level: number) => void = () => {};
  const timers = new Map<ReturnType<typeof setTimeout>, { due: number; callback: () => void }>();
  let paused: { remaining: number; callback: () => void }[] = [];
  let listening = false;
  let levels: ReturnType<typeof setInterval> | undefined;

  const clearLevels = () => {
    if (levels !== undefined) clearInterval(levels);
    levels = undefined;
    levelChanged(0);
  };
  const cancel = () => {
    active = false;
    for (const timer of timers.keys()) clearTimeout(timer);
    paused = [];
    muted = false;
    listening = false;
    timers.clear();
    clearLevels();
  };
  const stop = async () => {
    cancel();
    statusChanged("idle");
  };
  const later = (delay: number, callback: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (active) callback();
    }, delay);
    timers.set(timer, { due: Date.now() + delay, callback });
  };

  return {
    type: "custom",
    setMuted(value) {
      if (!active || value === muted) return;
      muted = value;
      if (!listening) return;
      if (muted) {
        for (const [timer, task] of timers) {
          clearTimeout(timer);
          paused.push({ remaining: Math.max(0, task.due - Date.now()), callback: task.callback });
        }
        timers.clear();
        levelChanged(0);
      } else {
        for (const task of paused) later(task.remaining, task.callback);
        paused = [];
      }
    },
    connect: async () => { statusChanged("connected"); },
    disconnect: async () => { cancel(); statusChanged("disconnected"); },
    startListening: async () => {
      if (active) return;
      active = true;
      listening = true;
      const metadata = { turnId: `demo-voice-${++turn}` };
      statusChanged("listening");
      let tick = 0;
      levels = setInterval(() => {
        if (!muted) levelChanged(0.15 + Math.abs(Math.sin(++tick * 0.65)) * 0.8);
      }, 120);
      const words = ["Help me", "Help me plan", "Help me plan a small", "Help me plan a small project."];
      words.forEach((text, index) => later((index + 1) * 1000, () => transcript("user", text, false, metadata)));
      later(5000, () => {
        listening = false;
        clearLevels();
        statusChanged("processing");
        transcript("user", words[words.length - 1], true, metadata);
      });
      later(6500, () => {
        statusChanged("speaking");
        transcript("assistant", "Start with a clear goal.", false, metadata);
      });
      later(8500, () => transcript("assistant", "Start with a clear goal, build the smallest useful version,", false, metadata));
      later(10500, () => transcript("assistant", "Start with a clear goal, build the smallest useful version, and test it with someone who will use it.", true, metadata));
      later(12000, () => { void stop(); });
    },
    stopListening: stop,
    deactivateBargeIn: stop,
    stopPlayback: () => { void stop(); },
    isBargeInActive: () => active,
    getInterruptionMode: () => "barge-in",
    onResult: () => {},
    onError: () => {},
    onStatusChange: callback => { statusChanged = callback; },
    onTranscript: callback => { transcript = callback; },
    onLevel: callback => { levelChanged = callback; },
  };
}
