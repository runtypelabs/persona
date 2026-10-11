// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAgentExperience } from './ui';
import { AgentWidgetSession } from './session';
import type { AgentWidgetConfig, DictationRenderContext, VoiceProvider, VoiceResult, VoiceStatus } from './types';
import { createStaticMentionSource } from './utils/mention-matcher';
import { loadContextMentionsInline } from './context-mentions-inline-loader';
import { loadContextMentions } from './context-mentions-loader';

const controllers: ReturnType<typeof createAgentExperience>[] = [];
function mockProvider() {
  let result: (value: VoiceResult) => void = () => {};
  let level: (value: number) => void = () => {};
  let status: (value: VoiceStatus) => void = () => {};
  const provider: VoiceProvider = {
    type: 'custom', connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    startListening: vi.fn(async () => { status('listening'); }), stopListening: vi.fn(async () => { status('processing'); }),
    onResult: (callback) => { result = callback; }, onLevel: (callback) => { level = callback; },
    onStatusChange: (callback) => { status = callback; }, onError: () => {},
  };
  return { provider, result: (text: string, isFinal = true) => result({ text, isFinal, provider: 'custom' }), level: (value: number) => level(value) };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); await flush(); };
function setup(config: AgentWidgetConfig = {}) {
  const mock = mockProvider();
  const mount = document.createElement('div'); document.body.append(mount);
  const controller = createAgentExperience(mount, { apiUrl: '/chat', persistState: false, features: { artifacts: { enabled: false } }, launcher: { enabled: false }, voiceRecognition: { enabled: true, completionBehavior: 'review', dictation: { display: 'transcript', provider: { type: 'custom', custom: () => mock.provider } } }, ...config });
  controllers.push(controller);
  const input = mount.querySelector<HTMLTextAreaElement>('[data-persona-composer-input]')!;
  return { controller, mount, input, mock };
}

beforeEach(() => { window.scrollTo = vi.fn(); });
afterEach(() => { controllers.splice(0).forEach((controller) => controller.destroy()); document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks(); });

describe('dictation surface', () => {
  it.each([false, true])('replaces composer contents and restores the draft for review in V5=%s', async (v5Defaults) => {
    const { controller, mount, input, mock } = setup({ future: { v5Defaults } });
    controller.setMessage('Existing draft');
    const mic = mount.querySelector<HTMLButtonElement>('[data-persona-composer-mic]')!;
    expect(mic.disabled).toBe(false);
    mic.click();
    await vi.waitFor(() => expect(controller.getDictationState().phase).toBe("recording"));
    const form = mount.querySelector<HTMLElement>('[data-persona-composer-form]')!;
    const surface = mount.querySelector<HTMLElement>('[data-persona-dictation]')!;
    expect(surface.parentElement).toBe(form);
    expect(Array.from(form.children).filter((child) => child !== surface).every((child) => (child as HTMLElement).style.display === 'none')).toBe(true);
    expect(input.readOnly).toBe(true);
    mock.result('provisional words', false);
    expect(input.value).toBe('Existing draft');
    expect(surface.querySelector('[data-persona-dictation-interim]')!.textContent).toBe('provisional words');
    expect(controller.finishDictation()).toBe(true); await flush();
    expect(controller.getDictationState().phase).toBe('processing');
    mock.result('Final words');
    expect(input.value).toBe('Existing draft Final words');
    expect(input.readOnly).toBe(false);
    expect(controller.getMessages()).toHaveLength(0);
    expect(mount.querySelector('[data-persona-dictation]')).toBeNull();
    expect(Array.from(form.children).some((child) => (child as HTMLElement).style.display !== 'none')).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it('keeps attachments and mention references across capture, cancel and final review', async () => {
    const { controller, mount, input, mock } = setup({ attachments: { enabled: true }, contextMentions: { enabled: true, sources: [createStaticMentionSource({ id: 'files', label: 'Files', items: [{ id: 'app', label: 'app' }], resolve: () => ({ llmAppend: 'context' }) })] } });
    input.value = '@app'; input.dispatchEvent(new Event('input', { bubbles: true }));
    await loadContextMentions(); await settle(); await settle();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle(); await settle();
    expect(controller.getComposerState().mentionRefs).toHaveLength(1);
    const picker = mount.querySelector<HTMLInputElement>('[data-persona-composer-attachment-input]')!;
    Object.defineProperty(picker, 'files', { configurable: true, value: [new File(['hello'], 'note.txt', { type: 'text/plain' })] });
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(controller.getComposerState().attachments[0]?.status).toBe('ready'));
    const before = controller.getComposerState();
    expect(before.attachments).toHaveLength(1);
    controller.startDictation(); await settle(); mock.result('discard me', false); controller.cancelDictation();
    expect(controller.getComposerState().mentionRefs).toEqual(before.mentionRefs);
    expect(controller.getComposerState().attachments).toEqual(before.attachments);
    expect(input.value).toBe(before.text);
    controller.startDictation(); await settle(); mock.result('keep me');
    expect(controller.getComposerState().mentionRefs).toEqual(before.mentionRefs);
    expect(controller.getComposerState().attachments).toEqual(before.attachments);
    expect(input.value).toContain('keep me');
  });

  it('preserves inline mention tokens during inline interim updates, cancel and final review', async () => {
    const { controller, mount, mock } = setup({ contextMentions: { enabled: true, display: 'inline', sources: [createStaticMentionSource({ id: 'files', label: 'Files', items: [{ id: 'app', label: 'app' }], resolve: () => ({ llmAppend: 'context' }) })] } });
    await loadContextMentionsInline(); await settle();
    const editor = mount.querySelector<HTMLElement>('[data-persona-composer-input]')!;
    expect(editor).not.toBeInstanceOf(HTMLTextAreaElement);
    editor.focus();
    mount.querySelector<HTMLButtonElement>('[data-persona-composer-mention-button]')!.click();
    await loadContextMentions(); await settle(); await settle();
    const option = document.querySelector<HTMLElement>('[role=option]')!;
    expect(option).not.toBeNull(); option.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
    expect(editor.querySelector('.persona-mention-token')).not.toBeNull();
    editor.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(controller.getComposerState().mentionRefs).toHaveLength(1));
    const refs = controller.getComposerState().mentionRefs;
    controller.update({ voiceRecognition: { dictation: { display: 'inline' } } });
    controller.startDictation(); await settle();
    expect(editor.getAttribute('contenteditable')).toBe('false');
    mock.result('interim', false);
    expect(editor.querySelector('.persona-mention-token')).not.toBeNull();
    controller.cancelDictation();
    expect(editor.querySelector('.persona-mention-token')).not.toBeNull();
    expect(controller.getComposerState().mentionRefs).toEqual(refs);
    controller.startDictation(); await settle(); mock.result('final words');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    expect(editor.querySelector('.persona-mention-token')).not.toBeNull();
    expect(controller.getComposerState().mentionRefs).toEqual(refs);
    expect(controller.getComposerState().text).toContain('final words');
  });

  it('uses renderDictation update/destroy and keeps amplitude out of lifecycle events', async () => {
    const updates: DictationRenderContext[] = [];
    const destroy = vi.fn();
    const hook = vi.fn((context: DictationRenderContext) => { updates.push(context); return { element: document.createElement('div'), update: (next: DictationRenderContext) => updates.push(next), destroy }; });
    const { controller, mock } = setup({ plugins: [{ id: 'dictation', renderDictation: hook }] });
    const listener = vi.fn(); controller.on('dictation:state', listener);
    controller.startDictation(); await settle();
    const count = listener.mock.calls.length;
    mock.level(0.72);
    expect(updates.at(-1)!.state.audioLevel).toBe(0.72);
    expect(listener).toHaveBeenCalledTimes(count);
    expect(updates.at(-1)!.instanceId).toBe(controller.instanceId);
    expect(listener.mock.calls.every(([state]) => state.instanceId === controller.instanceId && !('audioLevel' in state))).toBe(true);
    mock.result('ready');
    expect(hook).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('blocks programmatic sends while capture owns the draft and supports Escape cancel', async () => {
    const { controller, input, mount, mock } = setup();
    controller.setMessage('draft'); controller.startDictation(); await settle(); mock.result('interim', false);
    expect(controller.submitMessage()).toBe(false);
    expect(controller.setMessage('overwrite')).toBe(false);
    mount.querySelector('[data-persona-dictation]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(input.value).toBe('draft');
    expect(controller.getDictationState().phase).toBe('idle');
    mock.result('late result');
    expect(input.value).toBe('draft');
  });

  it('opts custom STT into review without changing full-duplex defaults', async () => {
    const mock = mockProvider();
    const { controller, input } = setup({ voiceRecognition: { enabled: true, completionBehavior: 'review', provider: { type: 'custom', custom: () => mock.provider } } });
    controller.startVoiceRecognition(); await settle(); mock.result('review custom');
    expect(input.value).toBe('review custom');
    expect(controller.getMessages()).toHaveLength(0);
  });

  it('queues send immediately after Start and sends only the finished transcript through the composer', async () => {
    const accepted: string[] = [];
    const { controller, mock, input } = setup({ composer: { onBeforeSend: (snapshot) => { accepted.push(snapshot.text); return false; } } });
    controller.update({ voiceRecognition: { dictation: { showSend: true } } });
    controller.setMessage('draft');
    expect(controller.startDictation()).toBe(true);
    expect(controller.sendDictation()).toBe(true);
    await vi.waitFor(() => expect(controller.getDictationState().phase).toBe('processing'));
    expect(accepted).toEqual([]);
    mock.result('final only'); mock.result('duplicate final'); await settle();
    expect(accepted).toEqual(['draft final only']);
    expect(input.value).toBe('draft final only');
    expect(controller.sendDictation()).toBe(false);
  });

  it('cancels pending startup without starting the provider and starts a later recording normally', async () => {
    const { controller, mock } = setup();
    expect(controller.startDictation()).toBe(true);
    expect(controller.cancelDictation()).toBe(true);
    await settle();
    expect(mock.provider.startListening).not.toHaveBeenCalled();
    expect(controller.startDictation()).toBe(true);
    await vi.waitFor(() => expect(mock.provider.startListening).toHaveBeenCalledTimes(1));
  });

  it('keeps interim browser text out of the draft until recognition actually ends', async () => {
    let recognition!: {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      start: () => void; stop: () => void; abort: () => void;
    };
    class FakeRecognition {
      start = vi.fn(); stop = vi.fn(); abort = vi.fn();
      constructor() { recognition = this; }
    }
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: FakeRecognition });
    const { controller, input } = setup({ voiceRecognition: { enabled: true, completionBehavior: 'review', dictation: { display: 'transcript' } } });
    controller.setMessage('draft'); controller.startDictation();
    await vi.waitFor(() => expect(recognition).toBeDefined()); await settle();
    recognition.onresult?.({ results: [{ 0: { transcript: 'spoken words' }, isFinal: true }] });
    expect(input.value).toBe('draft');
    controller.finishDictation();
    expect(controller.getDictationState().phase).toBe('processing');
    const late = recognition.onresult;
    recognition.onend?.();
    expect(input.value).toBe('draft spoken words');
    late?.({ results: [{ 0: { transcript: 'late words' }, isFinal: true }] });
    expect(input.value).toBe('draft spoken words');
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it('retains realtime conversation controls when dictation falls back to browser speech', () => {
    vi.spyOn(AgentWidgetSession.prototype, 'setupVoice').mockImplementation(() => {});
    const toggle = vi.spyOn(AgentWidgetSession.prototype, 'toggleVoice').mockResolvedValue(undefined);
    const { controller } = setup({ voiceRecognition: { enabled: true, provider: { type: 'runtype', runtype: { agentId: 'voice-test' } }, dictation: { display: 'transcript' } } });
    expect(controller.startVoiceRecognition()).toBe(true);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(controller.getDictationState().phase).toBe('idle');
  });

  it('hides the built-in mic without stopping a running conversation provider', async () => {
    const mock = mockProvider();
    const { controller, mount } = setup({ voiceRecognition: { enabled: true, provider: { type: 'custom', custom: () => mock.provider } } });
    expect(controller.startVoiceRecognition()).toBe(true);
    await vi.waitFor(() => expect(controller.getState().voiceActive).toBe(true));
    controller.update({ voiceRecognition: { showButton: false } }); await settle();
    expect(controller.getState().voiceActive).toBe(true);
    expect(mock.provider.stopListening).not.toHaveBeenCalled();
    expect(mock.provider.disconnect).not.toHaveBeenCalled();
    expect(mount.querySelector<HTMLElement>('[data-persona-voice-state]')?.dataset.personaVoiceState).toBe('recording');
  });

  it('respects showButton on first paint and config updates', async () => {
    const { controller, mount } = setup({ voiceRecognition: { enabled: true, showButton: false, dictation: { provider: { type: 'custom', custom: () => mockProvider().provider } } } });
    expect(mount.querySelector('[data-persona-composer-mic]')).toBeNull();
    controller.update({ voiceRecognition: { showButton: true } });
    expect(mount.querySelector('[data-persona-composer-mic]')).not.toBeNull();
    controller.update({ voiceRecognition: { showButton: false } });
    expect(mount.querySelector<HTMLElement>('[data-persona-composer-mic]')?.parentElement?.style.display).toBe('none');
  });
});
