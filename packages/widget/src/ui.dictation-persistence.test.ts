// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentExperience } from './ui';
import { loadDictationRuntime } from './dictation-runtime-loader';
import type { AgentWidgetStoredState, DictationProviderConfig, VoiceProvider, VoiceResult } from './types';

const controllers: ReturnType<typeof createAgentExperience>[] = [];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function capture(kind: 'browser' | 'custom') {
  const disconnect = vi.fn(async () => {});
  if (kind === 'browser') {
    let recognition: FakeRecognition;
    class FakeRecognition {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      start = vi.fn(); stop = vi.fn(); abort = disconnect;
      constructor() { recognition = this; }
    }
    vi.stubGlobal('SpeechRecognition', FakeRecognition);
    return {
      config: { type: 'browser' } satisfies DictationProviderConfig,
      disconnect,
      emit: (text: string, isFinal = false) => {
        recognition.onresult?.({ results: [{ 0: { transcript: text }, isFinal }] });
        if (isFinal) recognition.onend?.();
      },
    };
  }
  let onResult: (result: VoiceResult) => void = () => {};
  const provider: VoiceProvider = {
    type: 'custom', connect: async () => {}, disconnect,
    startListening: async () => {}, stopListening: async () => {},
    onResult: (callback) => { onResult = callback; }, onError: () => {}, onStatusChange: () => {},
  };
  return {
    config: { type: 'custom', custom: () => provider } satisfies DictationProviderConfig,
    disconnect,
    emit: (text: string, isFinal = false) => onResult({ text, isFinal, provider: 'custom' }),
  };
}

function storage(seed: AgentWidgetStoredState | null = null) {
  let stored = seed;
  return {
    snapshot: () => structuredClone(stored),
    adapter: {
      load: () => stored,
      save: (state: AgentWidgetStoredState) => { stored = structuredClone(state); },
    },
  };
}

function setup(provider: DictationProviderConfig, store: ReturnType<typeof storage>, review = false) {
  const mount = document.createElement('div'); document.body.append(mount);
  const send = vi.fn();
  const controller = createAgentExperience(mount, {
    apiUrl: '/chat', launcher: { enabled: false }, storageAdapter: store.adapter,
    voiceRecognition: { enabled: true, completionBehavior: review ? 'review' : 'send', dictation: { display: 'inline', provider } },
    composer: { onBeforeSend: () => { send(); return false; } },
  });
  controllers.push(controller);
  return { controller, mount, send, input: mount.querySelector<HTMLTextAreaElement>('[data-persona-composer-input]')! };
}

beforeEach(async () => {
  window.scrollTo = vi.fn();
  await loadDictationRuntime();
  vi.useFakeTimers();
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  document.body.replaceChildren(); localStorage.clear();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe.each(['browser', 'custom'] as const)('%s dictation draft persistence', (kind) => {
  it.each([
    [false, 'recording'], [true, 'recording'], [false, 'processing'], [true, 'processing'],
  ] as const)('saves the original draft before navigation without a debounce (cached=%s, phase=%s)', async (persisted, phase) => {
    const source = capture(kind);
    const store = storage();
    const { controller, input, send } = setup(source.config, store);
    await flush();
    input.value = 'original draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(controller.startDictation()).toBe(true); await flush();
    source.emit('discarded speech');
    expect(input.value).toBe('original draft discarded speech');
    if (phase === 'processing') { controller.finishDictation(); await flush(); }
    expect(controller.getDictationState().phase).toBe(phase);

    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }));
    const savedAtExit = store.snapshot();
    expect(savedAtExit?.draft?.text).toBe('original draft');
    expect(controller.getDictationState().phase).toBe('idle');
    expect(input.value).toBe('original draft');
    expect(input.readOnly).toBe(false);
    await flush();
    expect(source.disconnect).toHaveBeenCalledOnce();
    source.emit('late speech', true);
    expect(send).not.toHaveBeenCalled();
    expect(input.value).toBe('original draft');

    const restored = setup(source.config, storage(savedAtExit));
    await flush();
    expect(restored.input.value).toBe('original draft');
    expect(restored.input.readOnly).toBe(false);
    restored.input.value += ' edited'; restored.input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(restored.controller.getComposerState().text).toBe('original draft edited');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
  });

  it.each([false, true])('preserves completed review text on navigation (cached=%s)', async (persisted) => {
    const source = capture(kind);
    const store = storage();
    const { controller, input, send } = setup(source.config, store, true);
    await flush();
    input.value = 'original draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    controller.startDictation(); await flush(); source.emit('reviewed speech', true);
    expect(controller.getDictationState().phase).toBe('review');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }));
    const savedAtExit = store.snapshot();
    expect(savedAtExit?.draft?.text).toBe('original draft reviewed speech');
    const restored = setup(source.config, storage(savedAtExit)); await flush();
    expect(restored.input.value).toBe('original draft reviewed speech');
    expect(send).not.toHaveBeenCalled();
  });

  it.each([false, true])('cancels pending startup before navigation (cached=%s)', async (persisted) => {
    const source = capture(kind);
    const store = storage();
    const { controller, input, send } = setup(source.config, store);
    await flush();
    input.value = 'original draft'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(controller.startDictation()).toBe(true);
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted }));
    const savedAtExit = store.snapshot();
    await flush();
    expect(controller.getDictationState().phase).toBe('idle');
    expect(source.disconnect).not.toHaveBeenCalled();
    expect(savedAtExit?.draft?.text).toBe('original draft');
    const restored = setup(source.config, storage(savedAtExit)); await flush();
    expect(restored.input.value).toBe('original draft');
    expect(restored.input.readOnly).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
