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

/** Browser transcription with optional, independent microphone amplitude measurement. */
export function createBrowserDictationProvider(config: DictationProviderConfig['browser'], pauseDuration = 2000, measureAudioLevel = false): VoiceProvider {
  const root = window as BrowserWindow
  const Constructor = root.SpeechRecognition ?? root.webkitSpeechRecognition
  if (!Constructor) throw new Error('Speech recognition is unavailable. Use a browser with speech recognition support, such as Chrome, or type your message.')
  const recognition = new Constructor()
  recognition.lang = config?.language ?? 'en-US'
  recognition.continuous = config?.continuous ?? true
  recognition.interimResults = true
  let closed = false
  let capturing = false
  let output = ''
  let speechEventsObserved = false
  let speechActive = false
  let measuredLevel: number | undefined
  let pauseTimer: ReturnType<typeof setTimeout> | undefined
  let sampleTimer: ReturnType<typeof setInterval> | undefined
  let stream: MediaStream | undefined
  let observedTracks: MediaStreamTrack[] = []
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let analyser: AnalyserNode | undefined
  let onResult: (result: VoiceResult) => void = () => {}
  let onError: (error: Error) => void = () => {}
  let onStatus: (status: VoiceStatus) => void = () => {}
  let onLevel: (level: number) => void = () => {}

  const clearPause = () => { clearTimeout(pauseTimer); pauseTimer = undefined }
  const releaseAudio = () => {
    clearInterval(sampleTimer)
    sampleTimer = undefined
    source?.disconnect()
    analyser?.disconnect()
    source = undefined
    analyser = undefined
    observedTracks.forEach((track) => track.removeEventListener('ended', onMeterEnded))
    observedTracks = []
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    const previousContext = context
    context = undefined
    if (previousContext && previousContext.state !== 'closed') void previousContext.close().catch(() => {})
  }
  const onMeterEnded = () => {
    if (closed || !capturing || !stream) return
    releaseAudio()
    measuredLevel = undefined
    onLevel(0)
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
  const onPageHide = () => { fail(new Error('Dictation was interrupted by page navigation. Try dictating again.')) }
  const fail = (error: unknown) => {
    void disconnect()
    onError(error instanceof Error ? error : new Error(String(error)))
  }
  const measure = async () => {
    try {
      const AudioConstructor = root.AudioContext ?? root.webkitAudioContext
      if (!AudioConstructor || !navigator.mediaDevices?.getUserMedia) throw new Error('Microphone level measurement is unavailable.')
      const acquired = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (closed || !capturing) { acquired.getTracks().forEach((track) => track.stop()); return }
      stream = acquired
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
      if (closed || !capturing || context !== audio) return
      const samples = new Float32Array(meter.fftSize)
      sampleTimer = setInterval(() => {
        if (closed || !capturing) return
        meter.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
        const target = Math.min(1, rms * 4)
        const weight = measuredLevel === undefined || target > measuredLevel ? 0.65 : 0.2
        measuredLevel = measuredLevel === undefined ? target : measuredLevel + (target - measuredLevel) * weight
        onLevel(measuredLevel < 0.005 ? 0 : measuredLevel)
      }, 50)
    } catch {
      releaseAudio()
    }
  }
  const stopListening = async () => {
    if (closed || !capturing) return
    capturing = false
    clearPause()
    releaseAudio()
    recognition.stop()
  }
  const startPause = () => {
    clearPause()
    if (!capturing) return
    pauseTimer = setTimeout(() => {
      onStatus('processing')
      void stopListening().catch(fail)
    }, pauseDuration)
  }
  recognition.onspeechstart = () => {
    if (closed || !capturing) return
    speechEventsObserved = true
    speechActive = true
    clearPause()
  }
  recognition.onspeechend = () => {
    if (closed || !capturing) return
    const firstSpeechEvent = !speechEventsObserved
    speechEventsObserved = true
    if (!speechActive && !firstSpeechEvent) return
    speechActive = false
    startPause()
  }
  recognition.onresult = (event) => {
    if (closed) return
    const next = Array.from(event.results).map((result) => result[0].transcript.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1')
    if (next !== output) {
      output = next
      onResult({ text: output, provider: 'browser', isFinal: false })
      if (!speechEventsObserved) {
        clearPause()
        if (output.trim()) startPause()
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
      network: 'Speech recognition lost its connection. Try dictating again.',
      'not-allowed': 'Allow microphone access in your browser, then try again.',
      'audio-capture': 'No microphone is available. Check your microphone and try again.',
      'service-not-allowed': 'Speech recognition is unavailable in this browser. Try Chrome.',
    }
    if (!closed && error !== 'no-speech') fail(new Error(messages[error] ?? `Speech recognition stopped (${error}). Try again.`))
  }
  root.addEventListener('pagehide', onPageHide)
  return {
    type: 'browser',
    connect: async () => {},
    startListening: async () => {
      if (closed) throw new Error('This dictation capture has ended. Start a new recording.')
      if (capturing) return
      capturing = true
      try { recognition.start() } catch (error) { fail(error); throw error }
      if (!closed && capturing && measureAudioLevel) void measure()
    },
    stopListening,
    disconnect,
    onResult: (callback) => { onResult = callback },
    onError: (callback) => { onError = callback },
    onStatusChange: (callback) => { onStatus = callback },
    onLevel: (callback) => { onLevel = callback },
  }
}
