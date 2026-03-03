/**
 * Voice Activity Detector (VAD)
 *
 * Reusable RMS-based voice activity detection that monitors a mic stream
 * and fires a callback when a condition is sustained for a given duration.
 *
 * - mode 'silence': fires when volume stays below threshold (user stopped talking)
 * - mode 'speech':  fires when volume stays above threshold (user started talking)
 *
 * Fires callback exactly once per start() call, then stops checking.
 * Calling start() again implicitly calls stop() first.
 */
export class VoiceActivityDetector {
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private conditionStart: number | null = null;
  private fired = false;

  /**
   * Begin monitoring the given stream for voice activity.
   *
   * @param audioContext  Active AudioContext
   * @param stream       MediaStream from getUserMedia
   * @param mode         'silence' fires when quiet for duration, 'speech' fires when loud for duration
   * @param config       threshold (RMS level) and duration (ms)
   * @param callback     Fires exactly once when the condition is met
   */
  start(
    audioContext: AudioContext,
    stream: MediaStream,
    mode: "silence" | "speech",
    config: { threshold: number; duration: number },
    callback: () => void,
  ): void {
    this.stop();

    this.fired = false;
    this.conditionStart = null;

    this.sourceNode = audioContext.createMediaStreamSource(stream);
    this.analyserNode = audioContext.createAnalyser();
    this.analyserNode.fftSize = 2048;
    this.sourceNode.connect(this.analyserNode);

    const dataArray = new Float32Array(this.analyserNode.fftSize);

    this.interval = setInterval(() => {
      if (!this.analyserNode || this.fired) return;
      this.analyserNode.getFloatTimeDomainData(dataArray);

      // Compute RMS volume
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sum / dataArray.length);

      const conditionMet =
        mode === "silence"
          ? rms < config.threshold
          : rms >= config.threshold;

      if (conditionMet) {
        if (this.conditionStart === null) {
          this.conditionStart = Date.now();
        } else if (Date.now() - this.conditionStart >= config.duration) {
          this.fired = true;
          callback();
        }
      } else {
        this.conditionStart = null;
      }
    }, 100);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.analyserNode = null;
    this.conditionStart = null;
    this.fired = false;
  }
}
