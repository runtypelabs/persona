// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { DictationRenderContext } from '../types';
import { createDictationRenderer } from './dictation';

function context(): DictationRenderContext {
  return {
    instanceId: 'test',
    state: { phase: 'recording', recordingId: 1, transcript: '', interimTranscript: 'Provisional words', error: null, audioLevel: null },
    config: { voiceRecognition: { dictation: { display: 'transcript', waveform: true } } },
    actions: { cancel: vi.fn(), finish: vi.fn() },
    defaultRenderer: () => { throw new Error('Not used by built-in renderer'); },
  };
}

describe('dictation renderer', () => {
  it('styles interim text and only displays a waveform for measured levels', () => {
    const ctx = context();
    const view = createDictationRenderer(ctx);
    const interim = view.element.querySelector<HTMLElement>('[data-persona-dictation-interim]')!;
    const waveform = view.element.querySelector<HTMLElement>('[data-persona-dictation-waveform]')!;
    expect(interim.textContent).toBe('Provisional words');
    expect(interim.style.fontStyle).toBe('italic');
    expect(waveform.style.display).toBe('none');
    view.update!({ ...ctx, state: { ...ctx.state, audioLevel: 0.5 } });
    expect(waveform.style.display).toBe('flex');
    view.update!({ ...ctx, state: { ...ctx.state, phase: 'processing' } });
    expect(waveform.style.display).toBe('none');
    expect(view.element.querySelector('[role="status"]')!.textContent).toBe('Transcribing…');
    expect(view.element.querySelector<HTMLButtonElement>('[data-persona-dictation-action="finish"]')!.disabled).toBe(true);
    view.destroy!();
  });

  it('keeps waveform transcripts hidden and routes actions through the latest context', () => {
    const ctx = context();
    ctx.config.voiceRecognition!.dictation!.display = 'waveform';
    const view = createDictationRenderer(ctx);
    expect(view.element.querySelector<HTMLElement>('[data-persona-dictation-transcript]')!.hidden).toBe(true);
    const send = view.element.querySelector<HTMLButtonElement>('[data-persona-dictation-action="send"]')!;
    expect(send.hidden).toBe(true);
    const onSend = vi.fn();
    view.update!({ ...ctx, actions: { ...ctx.actions, send: onSend } });
    send.click();
    expect(onSend).toHaveBeenCalledOnce();
    view.element.querySelector<HTMLButtonElement>('[data-persona-dictation-action="cancel"]')!.click();
    expect(ctx.actions.cancel).toHaveBeenCalledOnce();
    view.destroy!();
  });
});
