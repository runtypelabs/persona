import { describe, it, expect, beforeEach } from "vitest";
import { ReadAloudController } from "./read-aloud-controller";
import type { ReadAloudState, SpeechCallbacks, SpeechEngine, SpeechRequest } from "../types";

class FakeEngine implements SpeechEngine {
  readonly id = "fake";
  readonly supportsPause: boolean;
  speakCalls: SpeechRequest[] = [];
  lastCallbacks: SpeechCallbacks | null = null;
  pauseCount = 0;
  resumeCount = 0;
  stopCount = 0;

  constructor(supportsPause = true) {
    this.supportsPause = supportsPause;
  }

  speak(request: SpeechRequest, callbacks: SpeechCallbacks): void {
    this.speakCalls.push(request);
    this.lastCallbacks = callbacks;
  }
  pause(): void {
    this.pauseCount++;
  }
  resume(): void {
    this.resumeCount++;
  }
  stop(): void {
    this.stopCount++;
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const req = (text: string): SpeechRequest => ({ text });

describe("ReadAloudController", () => {
  let engine: FakeEngine;
  let controller: ReadAloudController;
  let states: Array<[string | null, ReadAloudState]>;

  beforeEach(() => {
    engine = new FakeEngine(true);
    controller = new ReadAloudController(() => engine);
    states = [];
    controller.onChange((id, state) => states.push([id, state]));
  });

  it("goes idle → loading → playing on first toggle", async () => {
    controller.toggle("a", req("hello"));
    // loading is set synchronously, before the engine resolves
    expect(controller.stateFor("a")).toBe("loading");
    await tick();
    expect(engine.speakCalls).toHaveLength(1);
    engine.lastCallbacks!.onStart!();
    expect(controller.stateFor("a")).toBe("playing");
    expect(states.map((s) => s[1])).toEqual(["loading", "playing"]);
  });

  it("pauses then resumes a playing message", async () => {
    controller.toggle("a", req("hello"));
    await tick();
    engine.lastCallbacks!.onStart!();

    controller.toggle("a", req("hello")); // playing → pause
    expect(engine.pauseCount).toBe(1);
    expect(controller.stateFor("a")).toBe("paused");

    controller.toggle("a", req("hello")); // paused → resume
    expect(engine.resumeCount).toBe(1);
    expect(controller.stateFor("a")).toBe("playing");
  });

  it("stops a playing message (no resume) when the engine can't pause", async () => {
    engine = new FakeEngine(false);
    controller = new ReadAloudController(() => engine);
    controller.toggle("a", req("hello"));
    await tick();
    engine.lastCallbacks!.onStart!();

    controller.toggle("a", req("hello")); // playing → stop (no pause support)
    expect(engine.pauseCount).toBe(0);
    expect(engine.stopCount).toBeGreaterThanOrEqual(1);
    expect(controller.stateFor("a")).toBe("idle");
  });

  it("stops the previous message when a different one starts", async () => {
    controller.toggle("a", req("first"));
    await tick();
    engine.lastCallbacks!.onStart!();
    expect(controller.stateFor("a")).toBe("playing");

    controller.toggle("b", req("second")); // switch
    await tick();
    expect(engine.stopCount).toBeGreaterThanOrEqual(1);
    engine.lastCallbacks!.onStart!();
    expect(controller.stateFor("a")).toBe("idle");
    expect(controller.stateFor("b")).toBe("playing");
  });

  it("returns to idle on natural end", async () => {
    controller.toggle("a", req("hello"));
    await tick();
    engine.lastCallbacks!.onStart!();
    engine.lastCallbacks!.onEnd!();
    expect(controller.stateFor("a")).toBe("idle");
    expect(controller.activeMessageId()).toBeNull();
  });

  it("ignores a stale callback from a superseded request", async () => {
    controller.toggle("a", req("first"));
    await tick();
    const staleCallbacks = engine.lastCallbacks!;
    staleCallbacks.onStart!();

    controller.toggle("b", req("second")); // supersedes "a"
    await tick();
    engine.lastCallbacks!.onStart!();
    expect(controller.stateFor("b")).toBe("playing");

    // Late onEnd from the superseded "a" request must not clobber "b".
    staleCallbacks.onEnd!();
    expect(controller.stateFor("b")).toBe("playing");
  });

  it("stop() resets to idle and stops the engine", async () => {
    controller.toggle("a", req("hello"));
    await tick();
    engine.lastCallbacks!.onStart!();
    controller.stop();
    expect(controller.stateFor("a")).toBe("idle");
    expect(engine.stopCount).toBeGreaterThanOrEqual(1);
  });

  it("reports a null engine resolution as idle", async () => {
    const nullController = new ReadAloudController(() => null);
    const seen: ReadAloudState[] = [];
    nullController.onChange((_id, state) => seen.push(state));
    nullController.toggle("a", req("hello"));
    await tick();
    expect(nullController.stateFor("a")).toBe("idle");
    expect(seen).toEqual(["loading", "idle"]);
  });
});
