(() => {
  const state = window.__personaVoice;
  const fixture = window.__personaVerify;
  const proof = window.__dictationProof = { states: [], observations: [] };
  fixture.controller.on('dictation:state', (detail) => {
    proof.states.push({ at: performance.now(), ...detail });
    fixture.events.push({ at: performance.now(), type: 'dictation:state', detail });
  });
  const audio = new AudioContext();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const destination = audio.createMediaStreamDestination();
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  gain.gain.value = 0.15;
  navigator.mediaDevices.getUserMedia = async () => { await audio.resume(); return destination.stream; };
  const OriginalRecognition = window.SpeechRecognition;
  window.SpeechRecognition = class extends OriginalRecognition {
    start() {
      this._running = true;
      proof.startedAt = performance.now();
      state.mark('recognition:start', { scenario: 'missing-second-speechend' });
      this.onspeechstart?.();
      this._emit('result', { results: [[{ transcript: 'Hello there' }]] });
      this._timers.push(setTimeout(() => {
        gain.gain.value = 0;
        state.mark('proof:first-silence');
        this.onspeechend?.();
      }, 1000));
      this._timers.push(setTimeout(() => {
        gain.gain.value = 0.15;
        state.mark('proof:resumed-speech');
        this.onspeechstart?.();
        this._emit('result', { results: [[{ transcript: 'Hello there again' }]] });
      }, 2500));
      this._timers.push(setTimeout(() => {
        proof.observations.push({ scenario: 'six-seconds-sustained-sound-without-results', phase: fixture.controller.getDictationState().phase, at: performance.now() });
        gain.gain.value = 0;
        proof.silenceAt = performance.now();
        state.mark('proof:second-silence-no-speechend');
      }, 8500));
    }
    stop() {
      if (this._running) {
        proof.stoppedAt = performance.now();
        this._emit('result', { results: [[{ transcript: 'Hello there, again.' }]] });
        super.stop();
        setTimeout(() => { oscillator.stop(); destination.stream.getTracks().forEach((track) => track.stop()); void audio.close(); }, 50);
      }
    }
  };
  return 'Scripted recognition + real AudioContext/MediaStream/analyser ready';
})()
