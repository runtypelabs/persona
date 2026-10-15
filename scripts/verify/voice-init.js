// Voice instrumentation for the verify skill, injected before any page script
// via `agent-browser --init-script` (control-persona.mjs `open --voice`).
//
// It fakes only what headless Chromium cannot do and records everything else:
//   - SpeechRecognition / webkitSpeechRecognition: scripted recognizer (headless
//     Chrome has no Google speech backend, and the fake mic never reaches it).
//     Speech comes from window.__personaVoice.speech (string or string[]).
//   - speechSynthesis: records each utterance (text, voice, rate) and fires
//     start/end on a word-count clock; headless audio is not capturable.
//   - Web Audio output tap: anything connected to an AudioContext destination
//     is teed into a MediaRecorder, so server TTS played through the widget's
//     playback worklet is captured as real audio.
//   - WebSocket: per-socket counts and timings of binary (mic PCM) and JSON frames.
//   - Mic button: every class / aria-label transition of [data-persona-composer-mic].
// Real getUserMedia is untouched: launch Chromium with
// --use-file-for-fake-audio-capture=<wav> to feed a real file through it.
(() => {
  if (window.__personaVoice) return;
  const t0 = performance.now();
  const now = () => Math.round(performance.now() - t0);
  const timeline = [];
  const mark = (type, detail) => timeline.push({ at: now(), type, ...(detail ? { detail } : {}) });
  const state = {
    speech: "What are your opening hours?",
    wordMs: 140,
    utterances: [],
    sockets: [],
    timeline,
    mark,
  };
  window.__personaVoice = state;

  // ---- SpeechRecognition ----------------------------------------------------
  class FakeSpeechRecognition extends EventTarget {
    constructor() {
      super();
      this.continuous = false;
      this.interimResults = false;
      this.lang = "en-US";
      this.onstart = this.onresult = this.onerror = this.onend = null;
      this._timers = [];
      this._running = false;
    }
    _emit(type, extra) {
      const event = Object.assign(new Event(type), extra);
      const handler = this[`on${type}`];
      if (typeof handler === "function") handler.call(this, event);
      this.dispatchEvent(event);
    }
    start() {
      if (this._running) throw new DOMException("already started", "InvalidStateError");
      this._running = true;
      mark("recognition:start", { lang: this.lang, continuous: this.continuous });
      const phrases = [].concat(state.speech ?? []);
      const results = [];
      let at = 120;
      this._timers.push(setTimeout(() => this._emit("start"), 20));
      for (const phrase of phrases) {
        const words = String(phrase).split(/\s+/).filter(Boolean);
        const index = results.length;
        for (let n = 1; n <= words.length; n += 1) {
          const final = n === words.length;
          const text = words.slice(0, n).join(" ");
          at += state.wordMs;
          this._timers.push(
            setTimeout(() => {
              const result = Object.assign([{ transcript: text, confidence: 0.95 }], { isFinal: final });
              results[index] = result;
              mark(final ? "recognition:final" : "recognition:interim", { text });
              this._emit("result", { resultIndex: index, results: results.slice() });
            }, at),
          );
        }
      }
      if (!this.continuous) this._timers.push(setTimeout(() => this.stop(), at + 200));
    }
    stop() {
      if (!this._running) return;
      this._running = false;
      this._timers.forEach(clearTimeout);
      this._timers = [];
      mark("recognition:end");
      setTimeout(() => this._emit("end"), 10);
    }
    abort() {
      this.stop();
    }
  }
  window.SpeechRecognition = FakeSpeechRecognition;
  window.webkitSpeechRecognition = FakeSpeechRecognition;

  // ---- speechSynthesis --------------------------------------------------------
  const synth = Object.assign(new EventTarget(), {
    speaking: false,
    pending: false,
    paused: false,
    _queue: [],
    // No voices, as in headless Chrome: utterance.voice only accepts a real SpeechSynthesisVoice.
    getVoices: () => [],
    speak(utterance) {
      const record = {
        text: utterance.text,
        voice: utterance.voice?.name ?? null,
        rate: utterance.rate,
        pitch: utterance.pitch,
        queuedAt: now(),
      };
      state.utterances.push(record);
      mark("tts:queued", { text: utterance.text });
      synth._queue.push({ utterance, record });
      if (!synth.speaking) synth._next();
    },
    _next() {
      const item = synth._queue.shift();
      if (!item) {
        synth.speaking = false;
        return;
      }
      synth.speaking = true;
      const { utterance, record } = item;
      record.startedAt = now();
      mark("tts:start", { text: utterance.text });
      utterance.dispatchEvent?.(new Event("start"));
      utterance.onstart?.(new Event("start"));
      const words = String(utterance.text).split(/\s+/).filter(Boolean).length;
      synth._timer = setTimeout(() => {
        record.endedAt = now();
        mark("tts:end", { text: utterance.text });
        utterance.dispatchEvent?.(new Event("end"));
        utterance.onend?.(new Event("end"));
        synth._next();
      }, Math.max(300, (words * 300) / (utterance.rate || 1)));
    },
    cancel() {
      clearTimeout(synth._timer);
      synth._queue = [];
      synth.speaking = false;
      mark("tts:cancel");
    },
    pause() {
      synth.paused = true;
    },
    resume() {
      synth.paused = false;
    },
  });
  Object.defineProperty(window, "speechSynthesis", { configurable: true, get: () => synth });

  // ---- Mic input ----------------------------------------------------------------
  // When control-persona injects window.__personaVoiceMic (a WAV data: URL), an
  // audio getUserMedia gets a stream that starts that clip when the widget asks
  // for the mic, so the speech is never missed. Everything downstream (the
  // widget's AudioContext, worklet, resampling, socket) is real. Without it the
  // real getUserMedia runs (Chromium's --use-file-for-fake-audio-capture device,
  // which starts playing at browser launch, not at getUserMedia).
  const nativeGetUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  if (nativeGetUserMedia) {
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const micUrl = window.__personaVoiceMic;
      if (!micUrl || !constraints?.audio || constraints.video) return nativeGetUserMedia(constraints);
      const ctx = new AudioContext({ sampleRate: 48000 });
      const buffer = await ctx.decodeAudioData(await (await fetch(micUrl)).arrayBuffer());
      const dest = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(dest);
      // A context with nothing reaching its destination may never render, and the
      // stream stays digitally silent: keep it pulled through a muted path.
      const mute = ctx.createGain();
      mute.gain.value = 0;
      source.connect(mute);
      connect.call(mute, ctx.destination);
      await ctx.resume();
      source.start(ctx.currentTime + 0.3);
      mark("mic:clip-start", { durationMs: Math.round(buffer.duration * 1000), contextState: ctx.state });
      return dest.stream;
    };
  }

  // ---- Web Audio output tap ---------------------------------------------------
  // One recorder per AudioContext: the mic-capture context also feeds the
  // destination (silently, to keep its processor running), so a single shared
  // recorder would capture that silence instead of the playback context.
  const taps = new WeakMap();
  const tracks = [];
  const tapFor = (ctx) => {
    let tap = taps.get(ctx);
    if (tap) return tap;
    tap = ctx.createMediaStreamDestination();
    taps.set(ctx, tap);
    const track = { sampleRate: ctx.sampleRate, chunks: [], recorder: new MediaRecorder(tap.stream, { mimeType: "audio/webm;codecs=opus" }) };
    track.recorder.ondataavailable = (e) => e.data.size && track.chunks.push(e.data);
    track.recorder.start(250);
    tracks.push(track);
    mark("audio-tap:start", { context: tracks.length, sampleRate: ctx.sampleRate });
    return tap;
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (target, ...rest) {
    const result = connect.call(this, target, ...rest);
    if (typeof AudioDestinationNode !== "undefined" && target instanceof AudioDestinationNode) {
      try {
        connect.call(this, tapFor(target.context));
      } catch (error) {
        mark("audio-tap:error", { message: String(error) });
      }
    }
    return result;
  };

  // ---- WebSocket frames -------------------------------------------------------
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      // Vite's HMR socket is dev-server plumbing, not widget traffic.
      if ([].concat(protocols ?? []).includes("vite-hmr")) return;
      const info = { url: String(url).replace(/token=[^&]+/, "token=…"), openedAt: null, closedAt: null, sent: { binary: 0, bytes: 0, json: {} }, received: { binary: 0, bytes: 0, json: {} }, firstBinarySentAt: null, firstBinaryReceivedAt: null };
      state.sockets.push(info);
      mark("ws:connect", { url: info.url });
      this.addEventListener("open", () => {
        info.openedAt = now();
        mark("ws:open", { url: info.url });
      });
      this.addEventListener("close", (e) => {
        info.closedAt = now();
        mark("ws:close", { code: e.code });
      });
      this.addEventListener("message", (e) => {
        if (typeof e.data === "string") {
          let type = "text";
          try {
            type = JSON.parse(e.data).type ?? "json";
          } catch {}
          info.received.json[type] = (info.received.json[type] ?? 0) + 1;
          if (type !== "pong") mark("ws:recv", { type });
        } else {
          info.received.binary += 1;
          info.received.bytes += e.data.byteLength ?? e.data.size ?? 0;
          if (info.firstBinaryReceivedAt === null) {
            info.firstBinaryReceivedAt = now();
            mark("ws:first-audio-received");
          }
        }
      });
      this._verifyInfo = info;
    }
    send(data) {
      const info = this._verifyInfo;
      if (!info) return super.send(data);
      if (typeof data === "string") {
        let type = "text";
        try {
          type = JSON.parse(data).type ?? "json";
        } catch {}
        info.sent.json[type] = (info.sent.json[type] ?? 0) + 1;
        if (type !== "ping" && type !== "playback_progress") mark("ws:send", { type });
      } else {
        info.sent.binary += 1;
        info.sent.bytes += data.byteLength ?? data.size ?? 0;
        if (info.firstBinarySentAt === null) {
          info.firstBinarySentAt = now();
          mark("ws:first-mic-frame-sent");
        }
      }
      return super.send(data);
    }
  };

  // ---- Mic button state -------------------------------------------------------
  const describeMic = (el) => {
    const cls = ["recording", "processing", "speaking"].find((s) => el.classList.contains(`persona-voice-${s}`));
    return `${cls ?? "idle"} | ${el.getAttribute("aria-label") ?? ""}`;
  };
  let lastMic = null;
  const observeMic = () => {
    const el = document.querySelector("[data-persona-composer-mic]");
    if (!el) return;
    const d = describeMic(el);
    if (d !== lastMic) {
      lastMic = d;
      mark("mic", { state: d });
    }
  };
  new MutationObserver(observeMic).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "aria-label"],
  });

  // ---- Export -----------------------------------------------------------------
  state.export = async () => {
    // Idempotent: a retried capture gets the same audio back.
    if (!state._audio) {
      state._audio = [];
      for (const [index, track] of tracks.entries()) {
        if (track.recorder.state !== "inactive") {
          await new Promise((resolve) => {
            track.recorder.onstop = resolve;
            track.recorder.stop();
          });
        }
        if (!track.chunks.length) continue;
        const buf = new Uint8Array(await new Blob(track.chunks, { type: "audio/webm" }).arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        state._audio.push({ context: index + 1, sampleRate: track.sampleRate, mimeType: "audio/webm", base64: btoa(bin) });
      }
    }
    return JSON.stringify({ timeline, utterances: state.utterances, sockets: state.sockets, audio: state._audio });
  };
})();
