import type { DictationProviderConfig, VoiceProvider, VoiceResult, VoiceStatus } from '../types'

interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type BrowserWindow = Window & {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
  AudioContext?: typeof AudioContext
  webkitAudioContext?: typeof AudioContext
}

/** Browser transcription with independent microphone silence detection and optional amplitude reporting. */
export function createBrowserDictationProvider(config: DictationProviderConfig['browser'], pauseDuration = 2000, measureAudioLevel = false): VoiceProvider {
  const root = window as BrowserWindow
  const Constructor = root.SpeechRecognition ?? root.webkitSpeechRecognition
  if (!Constructor) throw new Error('Speech recognition is unavailable. Try Chrome or type your message.')
  const recognition = new Constructor()
  recognition.lang = config?.language ?? 'en-US'
  recognition.continuous = config?.continuous ?? true
  recognition.interimResults = true
  let closed = false
  let capturing = false
  let output = ''
  let speechActive: boolean | undefined
  let measuredLevel: number | undefined
  let audioActive: boolean | undefined
  let audioPause = false
  let pauseTimer: ReturnType<typeof setTimeout> | undefined
  let sampleTimer: ReturnType<typeof setInterval> | undefined
  let observedTracks: MediaStreamTrack[] = []
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let analyser: AnalyserNode | undefined
  let onResult: (result: VoiceResult) => void = () => {}
  let onError: (error: Error) => void = () => {}
  let onStatus: (status: VoiceStatus) => void = () => {}
  let onLevel: (level: number) => void = () => {}
  let onLevelUnavailable: () => void = () => {}

  const measurementUsable = () => context?.state === 'running' && observedTracks.length > 0
    && observedTracks.every((track) => !track.muted && track.readyState !== 'ended')
  const clearPause = () => { clearTimeout(pauseTimer); pauseTimer = undefined; audioPause = false }
  const invalidateMeasurement = () => {
    if (audioPause) clearPause()
    audioActive = undefined
    measuredLevel = undefined
    if (capturing && !pauseTimer && (speechActive === false || (speechActive === undefined && output))) startPause()
  }
  const releaseAudio = () => {
    clearInterval(sampleTimer)
    sampleTimer = undefined
    source?.disconnect()
    analyser?.disconnect()
    source = undefined
    analyser = undefined
    observedTracks.forEach((track) => track.removeEventListener('ended', onMeterEnded))
    observedTracks.forEach((track) => track.stop())
    observedTracks = []
    const previousContext = context
    context = undefined
    if (previousContext && previousContext.state !== 'closed') void previousContext.close().catch(() => {})
  }
  const onMeterEnded = () => {
    if (!capturing || !observedTracks.length) return
    releaseAudio()
    invalidateMeasurement()
    if (measureAudioLevel) onLevelUnavailable()
  }
  const disconnect = async () => {
    if (closed) return
    closed = true
    capturing = false
    clearPause()
    releaseAudio()
    root.removeEventListener('pagehide', onPageHide)
    recognition.onresult = null
    recognition.onend = null
    recognition.onerror = null
    recognition.onspeechstart = null
    recognition.onspeechend = null
    try { recognition.abort() } catch { return }
  }
  const onPageHide = () => { fail(new Error('Page navigation interrupted dictation. Try again.')) }
  const fail = (error: unknown) => {
    void disconnect()
    onError(error instanceof Error ? error : new Error(String(error)))
  }
  const measure = async () => {
    try {
      const AudioConstructor = root.AudioContext ?? root.webkitAudioContext
      if (!AudioConstructor || !navigator.mediaDevices?.getUserMedia) return
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!capturing) { acquired.getTracks().forEach((track) => track.stop()); return }
      observedTracks = acquired.getTracks()
      observedTracks.forEach((track) => track.addEventListener('ended', onMeterEnded))
      if (observedTracks.some((track) => track.readyState === 'ended')) { onMeterEnded(); return }
      const audio = new AudioConstructor()
      context = audio
      source = audio.createMediaStreamSource(acquired)
      const meter = audio.createAnalyser()
      analyser = meter
      meter.fftSize = 1024
      source.connect(meter)
      await audio.resume()
      if (!capturing || context !== audio) return
      const samples = new Float32Array(meter.fftSize)
      sampleTimer = setInterval(() => {
        if (!capturing) return
        if (!measurementUsable()) {
          const wasAvailable = audioActive !== undefined
          invalidateMeasurement()
          if (wasAvailable && measureAudioLevel) onLevelUnavailable()
          return
        }
        meter.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
        if (audioActive === undefined) clearPause()
        // WHY: A low amplitude threshold favors keeping noisy recordings open over cutting off quiet speech.
        audioActive = rms >= 0.005
        if (audioActive) {
          if (speechActive !== undefined) speechActive = true
          clearPause()
        } else if (!pauseTimer && (output || speechActive)) startPause(true)
        const target = Math.min(1, rms * 4)
        measuredLevel ??= target
        measuredLevel += (target - measuredLevel) * (target > measuredLevel ? 0.65 : 0.2)
        if (measureAudioLevel) onLevel(measuredLevel < 0.005 ? 0 : measuredLevel)
      }, 50)
    } catch {
      releaseAudio()
      invalidateMeasurement()
    }
  }
  const stopListening = async () => {
    if (!capturing) return
    capturing = false
    clearPause()
    releaseAudio()
    recognition.stop()
  }
  const startPause = (fromAudio = false) => {
    clearPause()
    if (!capturing) return
    audioPause = fromAudio
    pauseTimer = setTimeout(() => {
      if (fromAudio && !measurementUsable()) {
        invalidateMeasurement()
        if (measureAudioLevel) onLevelUnavailable()
        return
      }
      onStatus('processing')
      void stopListening().catch(fail)
    }, pauseDuration)
  }
  recognition.onspeechstart = () => {
    if (!capturing) return
    speechActive = true
    clearPause()
  }
  recognition.onspeechend = () => {
    if (!capturing) return
    if (speechActive === false) return
    speechActive = false
    if (audioActive === undefined) startPause()
    else if (!audioActive && !pauseTimer) startPause(true)
  }
  recognition.onresult = (event) => {
    if (closed) return
    const next = Array.from(event.results, (result) => result[0].transcript).join(' ').trim().replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1')
    if (next !== output) {
      output = next
      onResult({ text: output, provider: 'browser', isFinal: false })
      if (audioActive === undefined && speechActive === undefined) {
        clearPause()
        if (output) startPause()
      }
    }
  }
  recognition.onend = () => {
    if (closed) return
    void disconnect()
    onResult({ text: output, provider: 'browser', isFinal: true })
    onStatus('idle')
  }
  recognition.onerror = ({ error }) => {
    const messages: Record<string, string> = {
      network: 'Speech recognition connection lost. Try again.',
      'not-allowed': 'Allow microphone access, then try again.',
      'audio-capture': 'No microphone found. Check your microphone.',
      'service-not-allowed': 'Speech recognition is unavailable. Try Chrome.',
    }
    if (!closed && error !== 'no-speech') fail(new Error(messages[error] ?? `Speech recognition stopped (${error}). Try again.`))
  }
  root.addEventListener('pagehide', onPageHide)
  return {
    type: 'browser',
    connect: async () => {},
    startListening: async () => {
      if (closed) throw new Error('Recording ended. Start a new recording.')
      if (capturing) return
      capturing = true
      try { recognition.start() } catch (error) { fail(error); throw error }
      if (capturing) void measure()
    },
    stopListening,
    disconnect,
    onResult: (callback) => { onResult = callback },
    onError: (callback) => { onError = callback },
    onStatusChange: (callback) => { onStatus = callback },
    onLevel: (callback) => { onLevel = callback },
    onLevelUnavailable: (callback) => { onLevelUnavailable = callback },
  }
}
