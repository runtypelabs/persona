import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createDemoDictationProvider } from "./demo-dictation-provider";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("keeps provisional speech recording until finish, then delivers one delayed final", async () => {
  const provider = createDemoDictationProvider();
  const status = vi.fn();
  const result = vi.fn();
  const transcript = vi.fn();
  provider.onStatusChange(status);
  provider.onResult(result);
  provider.onTranscript!(transcript);
  await provider.startListening();
  await provider.startListening();
  vi.advanceTimersByTime(8000);
  expect(transcript).toHaveBeenCalledTimes(4);
  expect(result).not.toHaveBeenCalled();
  expect(status).toHaveBeenLastCalledWith("listening");
  await provider.stopListening();
  await provider.stopListening();
  expect(status).toHaveBeenLastCalledWith("processing");
  vi.advanceTimersByTime(1200);
  expect(result).toHaveBeenCalledExactlyOnceWith({ text: "Okay, I want something different to be done. And it should be simple.", provider: "custom" });
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels pending final text on disconnect and starts with an empty new capture", async () => {
  const provider = createDemoDictationProvider();
  const result = vi.fn();
  provider.onResult(result);
  await provider.startListening();
  vi.advanceTimersByTime(2000);
  await provider.stopListening();
  await provider.disconnect();
  vi.advanceTimersByTime(2000);
  expect(result).not.toHaveBeenCalled();
  await provider.connect();
  await provider.startListening();
  await provider.stopListening();
  vi.advanceTimersByTime(1200);
  expect(result).toHaveBeenCalledExactlyOnceWith({ text: "", provider: "custom" });
  expect(vi.getTimerCount()).toBe(0);
});
