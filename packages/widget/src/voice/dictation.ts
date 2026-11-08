import type { DictationState, DictationProviderConfig, VoiceProvider } from '../types';
import { createBrowserDictationProvider } from './browser-dictation-provider';

type DictationCallbacks = {
  onState: (state: DictationState, levelOnly: boolean) => void;
  onReview: (transcript: string) => void;
  onSend: () => void;
};

/** One capture generation at a time. Provider callbacks never write directly to the composer. */
export class DictationController {
  private state: DictationState = Object.freeze({ phase: 'idle', recordingId: 0, transcript: '', interimTranscript: '', error: null, audioLevel: null });
  private provider: VoiceProvider | null = null;
  private generation = 0;
  private destroyed = false;
  private sendOnCompletion = false;
  private sent = false;
  private ready = false;
  private finishRequested = false;
  private disconnecting: Promise<void> = Promise.resolve();

  constructor(private callbacks: DictationCallbacks) {}

  getState(): DictationState { return this.state; }
  refresh(): void { if (!this.destroyed) this.callbacks.onState(this.state, false); }

  private publish(patch: Partial<DictationState>, levelOnly = false): void {
    this.state = Object.freeze({ ...this.state, ...patch });
    this.callbacks.onState(this.state, levelOnly);
  }

  start(config: DictationProviderConfig, options: { autoSend: boolean; pauseDuration?: number; measureAudioLevel?: boolean }): boolean {
    if (this.destroyed || this.state.phase === 'recording' || this.state.phase === 'processing') return false;
    this.release();
    const generation = ++this.generation;
    this.sendOnCompletion = options.autoSend;
    this.sent = false;
    this.ready = false;
    this.finishRequested = false;
    this.publish({ phase: 'recording', recordingId: generation, transcript: '', interimTranscript: '', error: null, audioLevel: null });
    const current = () => !this.destroyed && generation === this.generation && ['recording', 'processing'].includes(this.state.phase);
    try {
      const source = config.custom;
      const provider = config.type === 'custom'
        ? (typeof source === 'function' ? source() : source)
        : createBrowserDictationProvider(config.browser, options.pauseDuration, options.measureAudioLevel);
      if (!provider || provider.type === 'runtype') throw new Error('Dictation requires a speech-to-text provider.');
      this.provider = provider;
      const result = (text: string, isFinal: boolean) => {
        if (!current()) return;
        if (!isFinal) {
          this.publish({ interimTranscript: text });
          return;
        }
        this.publish({ transcript: text, interimTranscript: '' });
        this.complete();
      };
      provider.onResult((value) => result(value.text, value.isFinal !== false));
      provider.onTranscript?.((role, text, isFinal) => { if (role === 'user') result(text, isFinal); });
      provider.onLevel?.((audioLevel) => {
        if (current() && this.state.phase === 'recording' && Number.isFinite(audioLevel)) {
          this.publish({ audioLevel: Math.max(0, Math.min(1, audioLevel)) }, true);
        }
      });
      provider.onError((error) => { if (current()) this.fail(error); });
      provider.onProcessingStart?.(() => { if (current()) this.publish({ phase: 'processing', audioLevel: null }); });
      provider.onStatusChange((status) => {
        if (!current()) return;
        if (status === 'processing') this.publish({ phase: 'processing', audioLevel: null });
        if (status === 'idle') this.complete();
        if (status === 'error') this.fail(new Error('Speech recognition failed.'));
      });
      void this.disconnecting.then(async () => {
        if (!current()) return;
        await provider.connect();
        if (!current()) { await provider.disconnect(); return; }
        await provider.startListening();
        if (!current()) { await provider.disconnect(); return; }
        this.ready = true;
        if (this.finishRequested) await provider.stopListening();
      }).catch((error: unknown) => { if (current()) this.fail(error); });
    } catch (error) { this.fail(error); }
    return true;
  }

  finish(send = false): boolean {
    if (this.state.phase === 'review') return send ? this.send() : false;
    if (this.state.phase !== 'recording') return false;
    this.sendOnCompletion ||= send;
    const generation = this.generation;
    this.publish({ phase: 'processing', audioLevel: null });
    // stopListening may only stop capture: keep processing until final result/idle.
    this.finishRequested = true;
    if (!this.ready) return true;
    void this.provider?.stopListening().catch((error: unknown) => {
      if (generation === this.generation && this.state.phase === 'processing') this.fail(error);
    });
    return true;
  }

  cancel(): boolean {
    if (this.destroyed || this.state.phase === 'idle') return false;
    ++this.generation;
    this.release();
    this.publish({ phase: 'idle', transcript: '', interimTranscript: '', error: null, audioLevel: null });
    return true;
  }

  send(): boolean {
    if (this.destroyed || this.state.phase !== 'review' || this.sent) return false;
    this.sent = true;
    this.publish({ phase: 'idle', audioLevel: null });
    this.callbacks.onSend();
    return true;
  }

  private complete(): void {
    if (!['recording', 'processing'].includes(this.state.phase)) return;
    const transcript = (this.state.transcript || this.state.interimTranscript).trim();
    if (!transcript) { this.fail(new Error('No speech was recognized.')); return; }
    if (this.state.phase === 'recording') this.publish({ phase: 'processing', audioLevel: null });
    this.release();
    this.callbacks.onReview(transcript);
    this.publish({ phase: 'review', transcript, interimTranscript: '', audioLevel: null });
    if (this.sendOnCompletion) this.send();
  }

  private fail(error: unknown): void {
    this.release();
    this.publish({ phase: 'error', error: error instanceof Error ? error.message : String(error), audioLevel: null });
  }

  private release(): void {
    const provider = this.provider;
    this.provider = null;
    if (provider) this.disconnecting = this.disconnecting.then(() => provider.disconnect()).catch(() => {});
  }

  destroy(): void {
    this.destroyed = true;
    ++this.generation;
    this.release();
  }
}
