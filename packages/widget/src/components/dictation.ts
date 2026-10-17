import type { DictationRenderContext, DictationRenderHandle } from '../types';
import { createNode } from '../utils/dom';
import type { renderLucideIcon } from '../utils/icons';
import type { attachTooltip } from '../utils/tooltip';

export type DictationRendererDeps = {
  renderLucideIcon: typeof renderLucideIcon;
  attachTooltip: typeof attachTooltip;
};

/** The built-in surface uses the same state/actions/lifecycle as plugin renderers. */
export function createDictationRenderer(initial: DictationRenderContext, { renderLucideIcon, attachTooltip }: DictationRendererDeps): DictationRenderHandle {
  let context = initial;
  const element = createNode('section', {
    className: 'persona-dictation',
    attrs: { 'data-persona-dictation': '', 'aria-label': 'Voice dictation' },
    style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', width: '100%', minWidth: '0', gridColumn: '1 / -1', color: 'var(--persona-text, #18181b)', fontFamily: 'inherit', fontSize: 'var(--persona-composer-font-size, 16px)', lineHeight: '1.5' },
  });
  const transcript = createNode('div', {
    attrs: { 'data-persona-dictation-transcript': '', dir: 'auto' },
    style: { flex: '1 1 auto', width: 'max-content', maxWidth: '100%', boxSizing: 'border-box', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: '120px', overflowY: 'auto', padding: '2px 4px' },
  });
  const finalText = createNode('span');
  const interimText = createNode('span', { attrs: { 'data-persona-dictation-interim': '' } });
  transcript.append(finalText, interimText);
  const row = createNode('div', { style: { display: 'flex', flex: '0 1 auto', alignItems: 'center', gap: '10px', width: '100%', maxWidth: '100%', minWidth: '0', marginInlineStart: 'auto' } });
  const status = createNode('div', {
    attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    style: { flex: '1 1 0', minWidth: '0', color: 'var(--persona-input-placeholder, var(--persona-text-muted, #71717a))' },
  });
  const waveform = createNode('div', {
    attrs: { 'data-persona-dictation-waveform': '', 'aria-hidden': 'true' },
    style: { alignItems: 'center', justifyContent: 'center', gap: '4px', height: '36px', minWidth: '0', color: 'var(--persona-input-placeholder, var(--persona-text-muted, #71717a))' },
  });
  const bars = Array.from({ length: 19 }, () => createNode('span', { style: { width: '3px', flexShrink: '0', borderRadius: '3px', background: 'currentColor' } }));
  waveform.append(...bars);
  const tooltips: ReturnType<typeof attachTooltip>[] = [];
  const button = (action: 'cancel' | 'finish' | 'send', label: string, icon: string) => {
    const node = createNode('button', {
      className: 'persona-composer-control',
      attrs: { type: 'button', 'aria-label': label, 'data-persona-dictation-action': action },
      style: { flexShrink: '0', borderRadius: '50%', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--persona-border, #d4d4d8)', color: 'inherit', background: 'transparent', cursor: 'pointer', padding: '0' },
    }) as HTMLButtonElement;
    const glyph = renderLucideIcon(icon, 18, 'currentColor', 2);
    if (glyph) node.append(glyph); else node.textContent = label;
    node.addEventListener('click', () => context.actions[action]?.());
    tooltips.push(attachTooltip({ anchor: node, text: () => node.getAttribute('aria-label') ?? label }));
    return node;
  };
  const cancel = button('cancel', 'Cancel dictation', 'x');
  const finish = button('finish', 'Finish dictation', 'check');
  const send = button('send', 'Finish and send', 'arrow-up');
  row.append(status, waveform, cancel, finish, send);
  element.append(transcript, row);
  const visible = (node: HTMLElement, show: boolean, display = 'block') => {
    node.hidden = !show;
    node.style.display = show ? display : 'none';
  };
  const update = (next: DictationRenderContext) => {
    const previous = context.state;
    context = next;
    const { state } = next;
    const config = next.config.voiceRecognition?.dictation ?? {};
    const waveformOnly = config.display === 'waveform';
    const hasTranscript = Boolean(state.transcript || state.interimTranscript);
    visible(element, state.phase !== 'idle' && state.phase !== 'review', 'flex');
    element.dataset.phase = state.phase;
    element.dataset.display = config.display ?? 'transcript';
    if (state.phase !== previous.phase || state.error !== previous.error || !status.textContent) {
      status.textContent = state.phase === 'recording' ? 'Listening…' : state.phase === 'processing' ? 'Transcribing…' : state.error ?? '';
    }
    finalText.textContent = state.transcript;
    interimText.textContent = state.interimTranscript;
    interimText.style.fontStyle = config.interimText?.fontStyle ?? 'italic';
    interimText.style.color = config.interimText?.color ?? 'var(--persona-input-placeholder, var(--persona-text-muted, #71717a))';
    status.style.fontStyle = state.phase === 'recording' && !waveformOnly ? config.interimText?.fontStyle ?? 'italic' : 'normal';
    visible(transcript, hasTranscript && config.display !== 'inline' && !waveformOnly && state.phase !== 'error');
    // Fit short speech beside the controls; natural flex wrapping gives longer
    // transcripts the full line without measuring text or observing resizes.
    row.style.width = transcript.hidden ? '100%' : 'auto';
    const measured = (config.waveform ?? waveformOnly) && state.audioLevel !== null && state.phase === 'recording';
    visible(waveform, measured, 'flex');
    // Keep a phase announcement without announcing each interim word or level.
    const quietStatus = state.phase === 'recording' && (waveformOnly ? measured : hasTranscript);
    status.className = quietStatus ? 'persona-sr-only' : '';
    status.style.flex = quietStatus ? '0 0 auto' : '1 1 0';
    waveform.style.flex = waveformOnly ? '1 1 0' : '0 1 140px';
    waveform.style.width = waveformOnly ? '' : '140px';
    waveform.style.marginInlineStart = 'auto';
    cancel.style.order = waveformOnly ? '-1' : '0';
    const reducedMotion = element.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bars.forEach((bar, index) => {
      const height = reducedMotion ? 6 : 3 + (state.audioLevel ?? 0) * Math.max(2, 31 - Math.abs(9 - index) * 3);
      bar.style.height = `${height}px`;
      bar.style.transition = reducedMotion ? 'none' : 'height 80ms linear';
    });
    visible(cancel, config.showCancel !== false, 'inline-flex');
    visible(finish, config.showFinish !== false && state.phase !== 'error', 'inline-flex');
    finish.disabled = state.phase !== 'recording';
    finish.style.opacity = finish.disabled ? '0.45' : '1';
    visible(send, Boolean(next.actions.send) && state.phase !== 'error', 'inline-flex');
    send.disabled = state.phase !== 'recording';
    send.style.opacity = send.disabled ? '0.45' : '1';
  };
  update(initial);
  return { element, update, destroy: () => { tooltips.forEach(tooltip => tooltip.destroy()); element.remove(); } };
}
