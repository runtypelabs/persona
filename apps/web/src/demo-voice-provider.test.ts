import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDemoVoiceProvider } from "./demo-voice-provider";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("plays a complete silent turn with partial transcripts and recording-only levels", async () => {
  const voice = createDemoVoiceProvider();
  const status = vi.fn();
  const transcript = vi.fn();
  const level = vi.fn();
  voice.onStatusChange(status);
  voice.onTranscript!(transcript);
  voice.onLevel!(level);
  await voice.connect();
  await voice.startListening();
  await voice.startListening(); // Repeated clicks must not start overlapping turns.
  vi.advanceTimersByTime(4000);
  expect(status.mock.calls.map(([value]) => value)).toEqual(["connected", "listening"]);
  expect(transcript).toHaveBeenCalledTimes(4);
  expect(transcript.mock.calls.every(([role, , final]) => role === "user" && !final)).toBe(true);
  expect(level.mock.calls.some(([value]) => value > 0 && value <= 1)).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(status).toHaveBeenLastCalledWith("processing");
  expect(transcript).toHaveBeenLastCalledWith("user", "Help me plan a small project.", true, { turnId: "demo-voice-1" });
  const levelsAtProcessing = level.mock.calls.length;
  vi.advanceTimersByTime(5500);
  expect(level).toHaveBeenCalledTimes(levelsAtProcessing);
  expect(transcript).toHaveBeenLastCalledWith("assistant", expect.any(String), true, { turnId: "demo-voice-1" });
  vi.advanceTimersByTime(1500);
  expect(status.mock.calls.map(([value]) => value)).toEqual(["connected", "listening", "processing", "speaking", "idle"]);
  expect(voice.isBargeInActive!()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["stopListening", "disconnect"] as const)("cancels every pending callback on %s and can replay", async method => {
  const voice = createDemoVoiceProvider();
  const transcript = vi.fn();
  voice.onTranscript!(transcript);
  await voice.startListening();
  vi.advanceTimersByTime(2000);
  await voice[method]();
  const count = transcript.mock.calls.length;
  vi.advanceTimersByTime(20000);
  expect(transcript).toHaveBeenCalledTimes(count);
  expect(vi.getTimerCount()).toBe(0);
  await voice.connect();
  await voice.startListening();
  vi.advanceTimersByTime(12000);
  expect(transcript).toHaveBeenLastCalledWith("assistant", expect.any(String), true, { turnId: "demo-voice-2" });
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps independently mounted previews isolated", async () => {
  const first = createDemoVoiceProvider();
  const second = createDemoVoiceProvider();
  const secondTranscript = vi.fn();
  second.onTranscript!(secondTranscript);
  await first.startListening();
  await second.startListening();
  await first.disconnect();
  vi.advanceTimersByTime(12000);
  expect(secondTranscript).toHaveBeenLastCalledWith("assistant", expect.any(String), true, { turnId: "demo-voice-1" });
  expect(vi.getTimerCount()).toBe(0);
});

it("pauses sample speech while muted and resumes without skipping words", async () => {
  const voice = createDemoVoiceProvider();
  const transcript = vi.fn();
  const status = vi.fn();
  const level = vi.fn();
  voice.onTranscript!(transcript);
  voice.onStatusChange(status);
  voice.onLevel!(level);
  await voice.startListening();
  vi.advanceTimersByTime(2000);
  voice.setMuted(true);
  const count = transcript.mock.calls.length;
  vi.advanceTimersByTime(15000);
  expect(transcript).toHaveBeenCalledTimes(count);
  expect(status).toHaveBeenLastCalledWith("listening");
  expect(level).toHaveBeenLastCalledWith(0);
  voice.setMuted(false);
  vi.advanceTimersByTime(1000);
  expect(transcript).toHaveBeenLastCalledWith("user", "Help me plan a small", false, expect.any(Object));
  voice.setMuted(true);
  await voice.disconnect();
  voice.setMuted(false);
  vi.advanceTimersByTime(20000);
  expect(transcript).toHaveBeenCalledTimes(count + 1);
  expect(vi.getTimerCount()).toBe(0);
});
