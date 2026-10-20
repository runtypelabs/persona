# Dictation

Persona can record speech into the composer for review, with a transcript or measured waveform and separate Cancel, Finish, and optional Send controls. This is opt-in in both V4 and V5. Existing browser microphone behavior and full-duplex voice conversations keep their defaults.

```ts
voiceRecognition: {
  enabled: true,
  completionBehavior: 'review',
  dictation: {
    display: 'transcript', // 'waveform' or 'inline'
    waveform: true,
    interimText: { fontStyle: 'italic', color: '#71717a' },
    showCancel: true,
    showFinish: true,
    showSend: false,
  },
}
```

`transcript` keeps short interim text beside the waveform and capture controls, wrapping the controls below only when the transcript needs more room. `waveform` emphasizes capture amplitude; providers without an audio graph show a truthful Listening status instead of simulated bars. `inline` mirrors the live transcript into the existing editor. On the transcript surface, interim text is muted and italic by default. The inline editor retains its ordinary text styling. Final text becomes normal editable composer text. Measured bars stop animating under reduced motion.

The dedicated surface replaces the composer contents during recording and processing, then restores the editor at review. Cancel restores the original draft, leaving mentions, attachments, modes, and quoted context in place. Final transcription is appended to the original draft. Finish ends capture; `completionBehavior: 'review'` keeps the result for editing. The default `'send'` submits through the same composer pipeline as a manual send, including mention resolution, attachment handling, send locks and `onBeforeSend`.

With `showSend: true`, a separate Finish and send control submits the finished transcript. Keyboard submission during capture takes this path only when enabled; otherwise it is blocked. `showSend: false` hides this additional control; it does not override `completionBehavior`. During review the ordinary composer Send button remains available. Escape cancels capture. Error states preserve the draft and let the user cancel or retry with a new capture.

## Custom speech-to-text

```ts
voiceRecognition: {
  enabled: true,
  completionBehavior: 'review',
  dictation: {
    provider: { type: 'custom', custom: () => createMySttProvider() },
    display: 'transcript',
  },
}
```

The custom provider implements `VoiceProvider`. Use `onResult({ text, provider: 'custom' })` for the finished transcript. For provisional text use `onResult({ text, provider: 'custom', isFinal: false })`, or `onTranscript('user', text, false)`. Each transcript callback contains the complete current text. A final `onTranscript('user', text, true)` completes capture too. `onLevel` is optional and reports measured amplitude from 0 to 1.

`stopListening()` may return before transcription finishes: Persona stays in processing until a final result or an `idle` status arrives. Emit `processing` while waiting, then the final transcript, then `idle`. Emit `onError(error)` on failure. A natural `idle` completes the latest text; an empty capture becomes an error. `disconnect()` must release hardware, timers, network work, and queued output. Prefer a factory returning a fresh provider for each recording; a reused instance must discard output from previous recordings on disconnect. Persona rejects callbacks registered by cancelled, superseded or destroyed captures, and ignores duplicate final results.

If no dictation provider is specified, Persona uses a configured custom provider or browser SpeechRecognition. Setting `completionBehavior: 'review'` on a custom STT provider also opts it into composer dictation. Full-duplex custom providers should use a separate `dictation.provider` for STT, keeping their conversation provider in `voiceRecognition.provider`.

## Programmatic controls and events

Controllers expose `startDictation()`, `finishDictation()`, `cancelDictation()`, `sendDictation()` and `getDictationState()`. Actions return a boolean indicating whether the action was accepted. `sendDictation()` requires `showSend: true`. A Finish immediately after Start is queued while the lazy runtime/provider connects. Concurrent dictation and voice conversations are refused.

When dictation is configured, the built-in microphone starts dictation. A separate conversation provider can still be started with `startVoiceRecognition()` and stopped with `stopVoiceRecognition()`. Set `voiceRecognition.showButton: false` to supply your own controls.

```ts
widget.on('dictation:state', (state, { instanceId }) => {
  // phase: idle | recording | processing | review | error
  console.log(instanceId, state.recordingId, state.phase, state.error);
});
```

The event includes `instanceId`, `recordingId`, `transcript`, `interimTranscript`, `phase`, `error`, and `timestamp`. Audio samples are excluded from public lifecycle events; they stay in the instance-local renderer context and state getter.

## Custom dictation renderer

```ts
const plugin = {
  id: 'my-dictation',
  renderDictation(context) {
    const element = document.createElement('div');
    function update(next) {
      element.textContent = next.state.interimTranscript || next.state.transcript;
    }
    update(context);
    return { element, update, destroy() { element.remove(); } };
  },
};
```

The first non-null `renderDictation(context)` result wins. Return an `HTMLElement`, a `{ element, update?, destroy? }` handle, or `null` for fallback. `context` supplies `instanceId`, widget `config`, immutable `state`, `actions.cancel`, `actions.finish`, optional `actions.send`, and `defaultRenderer()` returning the built-in handle. The `state` includes measured `audioLevel`, or `null` when unavailable. Updates arrive for phase/transcript changes and audio samples. An element-only renderer can use action closures; a handle receives live updates. Handles are destroyed when the surface closes for review/cancel, and when the widget is destroyed.

Custom controls should be real buttons with accessible names, give processing/error status to assistive technology, honor reduced motion, and represent unavailable audio measurements honestly.
