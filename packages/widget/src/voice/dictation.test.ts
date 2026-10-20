import { describe, expect, it, vi } from 'vitest';
import { DictationController } from './dictation';
import type { VoiceProvider, VoiceResult, VoiceStatus } from '../types';

function mockProvider() {
  let result: (result: VoiceResult) => void = () => {};
  let status: (status: VoiceStatus) => void = () => {};
  let error: (error: Error) => void = () => {};
  let level: (level: number) => void = () => {};
  const provider: VoiceProvider = {
    type: 'custom', connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}),
    startListening: vi.fn(async () => {}), stopListening: vi.fn(async () => { status('processing'); }),
    onResult: (callback) => { result = callback; }, onError: (callback) => { error = callback; },
    onStatusChange: (callback) => { status = callback; }, onLevel: (callback) => { level = callback; },
  };
  return { provider, result: (text: string, isFinal = true) => result({ text, isFinal, provider: 'custom' }), status: (value: VoiceStatus) => status(value), error: (message: string) => error(new Error(message)), level: (value: number) => level(value) };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const setup = () => {
  const callbacks = { onState: vi.fn(), onReview: vi.fn(), onSend: vi.fn() };
  return { controller: new DictationController(callbacks), ...callbacks };
};

describe('independent dictation lifecycle', () => {
  it('waits for delayed final STT after stop resolves and sends at most once', async () => {
    const mock = mockProvider();
    const { controller, onReview, onSend } = setup();
    controller.start({ type: 'custom', custom: mock.provider }, { autoSend: false });
    await flush();
    mock.result('interim', false);
    expect(controller.getState().interimTranscript).toBe('interim');
    expect(controller.finish(true)).toBe(true);
    await flush();
    expect(controller.getState().phase).toBe('processing');
    expect(onReview).not.toHaveBeenCalled();
    mock.result('final transcript');
    mock.result('duplicated final');
    mock.status('idle');
    expect(onReview).toHaveBeenCalledExactlyOnceWith('final transcript');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(controller.send()).toBe(false);
  });

  it('keeps review editable without an automatic send', async () => {
    const mock = mockProvider();
    const { controller, onSend } = setup();
    controller.start({ type: 'custom', custom: mock.provider }, { autoSend: false });
    await flush();
    mock.result('Review me');
    expect(controller.getState().phase).toBe('review');
    expect(onSend).not.toHaveBeenCalled();
    expect(controller.send()).toBe(true);
    expect(controller.send()).toBe(false);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('ignores callbacks from cancelled, replaced, and destroyed captures', async () => {
    const first = mockProvider();
    const second = mockProvider();
    const { controller, onReview, onSend } = setup();
    controller.start({ type: 'custom', custom: first.provider }, { autoSend: true });
    await flush();
    controller.cancel();
    first.result('cancelled');
    controller.start({ type: 'custom', custom: second.provider }, { autoSend: false });
    await flush();
    first.result('old recording'); first.error('late error'); first.status('idle');
    expect(controller.getState().phase).toBe('recording');
    controller.destroy();
    second.result('destroyed');
    expect(onReview).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('queues Finish until connection and capture startup complete', async () => {
    const mock = mockProvider();
    let connect!: () => void;
    mock.provider.connect = vi.fn(() => new Promise<void>((resolve) => { connect = resolve; }));
    const { controller } = setup();
    controller.start({ type: 'custom', custom: mock.provider }, { autoSend: false });
    await flush();
    controller.finish();
    expect(mock.provider.stopListening).not.toHaveBeenCalled();
    connect(); await flush();
    expect(mock.provider.startListening).toHaveBeenCalledTimes(1);
    expect(mock.provider.stopListening).toHaveBeenCalledTimes(1);
    mock.result('finished');
    expect(controller.getState().phase).toBe('review');
  });

  it('does not start capture when cancelled during connect', async () => {
    const mock = mockProvider();
    let connect!: () => void;
    mock.provider.connect = vi.fn(() => new Promise<void>((resolve) => { connect = resolve; }));
    const { controller } = setup();
    controller.start({ type: 'custom', custom: mock.provider }, { autoSend: false });
    await flush(); controller.cancel(); connect(); await flush();
    expect(mock.provider.startListening).not.toHaveBeenCalled();
    expect(mock.provider.disconnect).toHaveBeenCalled();
  });

  it('reports errors without committing draft text, and keeps levels instance-local', async () => {
    const mock = mockProvider();
    const { controller, onState, onReview } = setup();
    controller.start({ type: 'custom', custom: mock.provider }, { autoSend: false });
    await flush();
    mock.level(4);
    expect(controller.getState().audioLevel).toBe(1);
    expect(onState).toHaveBeenLastCalledWith(controller.getState(), true);
    mock.error('Transcription failed');
    expect(controller.getState().phase).toBe('error');
    expect(controller.getState().error).toBe('Transcription failed');
    expect(onReview).not.toHaveBeenCalled();
    mock.result('late');
    expect(onReview).not.toHaveBeenCalled();
  });
});
