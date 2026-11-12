import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrowserDictationProvider } from './browser-dictation-provider'
import { DictationController } from './dictation'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function setup(pauseDuration = 2000, measureAudioLevel = true) {
  vi.useFakeTimers()
  const stopTrack = vi.fn()
  const track = Object.assign(new EventTarget(), { stop: stopTrack, readyState: 'live' })
  const stream = { getTracks: () => [track] } as unknown as MediaStream
  const permission = deferred<MediaStream>()
  const resume = deferred<void>()
  const meter = {
    fftSize: 0, disconnect: vi.fn(),
    getFloatTimeDomainData: vi.fn((values: Float32Array) => values.fill(0.1)),
  }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const audio = {
    state: 'running', createMediaStreamSource: vi.fn(() => source),
    createAnalyser: vi.fn(() => meter), resume: vi.fn(() => resume.promise),
    close: vi.fn(async () => { audio.state = 'closed' }),
  }
  const recognition = {
    lang: '', continuous: false, interimResults: false,
    onresult: null as null | ((event: unknown) => void),
    onend: null as null | (() => void),
    onspeechstart: null as null | (() => void),
    onspeechend: null as null | (() => void),
    onerror: null as null | ((event: { error: string }) => void),
    start: vi.fn(), stop: vi.fn(), abort: vi.fn(),
  }
  const root = new EventTarget()
  Object.assign(root, {
    SpeechRecognition: class { constructor() { return recognition } },
    AudioContext: class { constructor() { return audio } },
  })
  vi.stubGlobal('window', root)
  const getUserMedia = vi.fn(() => permission.promise)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const provider = createBrowserDictationProvider(undefined, pauseDuration, measureAudioLevel)
  const result = vi.fn(), error = vi.fn(), status = vi.fn(), level = vi.fn(), levelUnavailable = vi.fn()
  provider.onResult(result)
  provider.onError(error)
  provider.onStatusChange(status)
  provider.onLevel?.(level)
  provider.onLevelUnavailable?.(levelUnavailable)
  const flush = async () => { await Promise.resolve(); await Promise.resolve() }
  const ready = async () => { permission.resolve(stream); await flush(); resume.resolve(); await flush() }
  const transcript = () => recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there' } }] })
  return { provider, track, recognition, audio, meter, source, permission, resume, stream, stopTrack, root, result, error, status, level, levelUnavailable, ready, flush, transcript, getUserMedia }
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('measured browser dictation', () => {
  it('keeps interim transcripts open, reports measured amplitude, and releases on finish before final text', async () => {
    const h = setup()
    await h.provider.startListening()
    expect(h.recognition).toMatchObject({ lang: 'en-US', continuous: true, interimResults: true })
    await h.ready()
    await vi.advanceTimersByTimeAsync(50)
    expect(h.level).toHaveBeenLastCalledWith(expect.closeTo(0.4))
    h.transcript()
    expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello there', provider: 'browser', isFinal: false })
    await h.provider.stopListening()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
    expect(h.source.disconnect).toHaveBeenCalledOnce()
    expect(h.meter.disconnect).toHaveBeenCalledOnce()
    h.recognition.onend?.()
    expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello there', provider: 'browser', isFinal: true })
    const samples = h.level.mock.calls.length
    await vi.advanceTimersByTimeAsync(5000)
    expect(h.level).toHaveBeenCalledTimes(samples)
    expect(h.recognition.stop).toHaveBeenCalledOnce()
    await h.provider.disconnect()
    expect(h.stopTrack).toHaveBeenCalledOnce()
  })

  it.each(['cancel', 'finish', 'unload', 'error'] as const)('releases a microphone permission result arriving after %s', async (action) => {
    const h = setup()
    await h.provider.startListening()
    if (action === 'cancel') await h.provider.disconnect()
    if (action === 'finish') await h.provider.stopListening()
    if (action === 'unload') h.root.dispatchEvent(new Event('pagehide'))
    if (action === 'error') h.recognition.onerror?.({ error: 'not-allowed' })
    h.permission.resolve(h.stream)
    await h.flush()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.createAnalyser).not.toHaveBeenCalled()
    expect(h.level).not.toHaveBeenCalled()
    if (action === 'error') expect(h.error).toHaveBeenCalledOnce()
  })

  it('does not start sampling if cancellation happens during audio resume', async () => {
    const h = setup()
    await h.provider.startListening()
    h.permission.resolve(h.stream)
    await h.flush()
    await h.provider.disconnect()
    h.resume.resolve()
    await h.flush()
    await vi.advanceTimersByTimeAsync(500)
    expect(h.level).not.toHaveBeenCalled()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
  })

  it('continues dictation if the waveform microphone is denied', async () => {
    const h = setup()
    await h.provider.startListening()
    h.permission.reject(new Error('Microphone denied'))
    await h.flush()
    h.transcript()
    await h.provider.stopListening()
    h.recognition.onend?.()
    expect(h.error).not.toHaveBeenCalled()
    expect(h.result).toHaveBeenLastCalledWith(expect.objectContaining({ isFinal: true }))
  })

  it('releases all audio resources if audio resume fails while retaining transcription', async () => {
    const h = setup()
    await h.provider.startListening()
    h.permission.resolve(h.stream)
    await h.flush()
    h.resume.reject(new Error('Audio unavailable'))
    await h.flush()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
    h.transcript()
    expect(h.result).toHaveBeenCalledOnce()
    expect(h.recognition.abort).not.toHaveBeenCalled()
  })

  it('finishes after a transcript pause and releases audio on a natural end', async () => {
    const h = setup()
    await h.provider.startListening()
    await h.ready()
    h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
    h.transcript()
    await vi.advanceTimersByTimeAsync(2050)
    expect(h.status).toHaveBeenCalledWith('processing')
    expect(h.recognition.stop).toHaveBeenCalledOnce()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    h.recognition.onend?.()
    expect(h.status).toHaveBeenLastCalledWith('idle')
  })

  it('allows no-speech to end as an empty final result without leaking capture', async () => {
    const h = setup()
    await h.provider.startListening()
    await h.ready()
    h.recognition.onerror?.({ error: 'no-speech' })
    expect(h.error).not.toHaveBeenCalled()
    h.recognition.onend?.()
    expect(h.result).toHaveBeenCalledWith({ text: '', provider: 'browser', isFinal: true })
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
  })

  it.each(['cancel', 'unload', 'error'] as const)('releases active capture on %s and ignores subsequent sampling', async (action) => {
    const h = setup()
    await h.provider.startListening()
    await h.ready()
    if (action === 'cancel') await h.provider.disconnect()
    if (action === 'unload') h.root.dispatchEvent(new Event('pagehide'))
    if (action === 'error') h.recognition.onerror?.({ error: 'network' })
    await vi.advanceTimersByTimeAsync(500)
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
    expect(h.level).not.toHaveBeenCalled()
  })

  it('releases capture even if the recognition engine rejects abort', async () => {
    const h = setup()
    await h.provider.startListening()
    await h.ready()
    h.recognition.abort.mockImplementation(() => { throw new Error('Already stopped') })
    await expect(h.provider.disconnect()).resolves.toBeUndefined()
    expect(h.stopTrack).toHaveBeenCalledOnce()
    expect(h.audio.close).toHaveBeenCalledOnce()
  })

  it('ignores callbacks retained from a cancelled recording after a new capture starts', async () => {
    const h = setup()
    await h.provider.startListening()
    const oldResult = h.recognition.onresult
    const oldEnd = h.recognition.onend
    await h.provider.disconnect()
    const next = createBrowserDictationProvider(undefined, 2000, true)
    await next.startListening()
    oldResult?.({ results: [{ 0: { transcript: 'stale' } }] })
    oldEnd?.()
    expect(h.result).not.toHaveBeenCalled()
    expect(h.status).not.toHaveBeenCalled()
    await next.disconnect()
    h.permission.resolve(h.stream)
    await h.flush()
    expect(h.stopTrack).toHaveBeenCalledTimes(2)
  })
})

it('normalizes recognition segment whitespace and suppresses identical interim revisions', async () => {
  const h = setup()
  await h.provider.startListening()
  h.recognition.onresult?.({ results: [{ 0: { transcript: ' I wonder ' } }, { 0: { transcript: '  why ' } }, { 0: { transcript: ' ?' } }] })
  expect(h.result).toHaveBeenLastCalledWith({ text: 'I wonder why?', provider: 'browser', isFinal: false })
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'I wonder why?' } }] })
  expect(h.result).toHaveBeenCalledOnce()
  await h.provider.stopListening()
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith({ text: 'I wonder why?', provider: 'browser', isFinal: true })
  h.permission.resolve(h.stream)
  await h.flush()
})

it('softens measured level decay without inventing amplitude during silence', async () => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  await vi.advanceTimersByTimeAsync(50)
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(50)
  expect(h.level).toHaveBeenLastCalledWith(expect.closeTo(0.32))
  await vi.advanceTimersByTimeAsync(1500)
  expect(h.level).toHaveBeenLastCalledWith(0)
  expect(h.levelUnavailable).not.toHaveBeenCalled()
  await h.provider.disconnect()
})

it('replaces revisions and drops removed interim segments instead of appending them', async () => {
  const h = setup()
  await h.provider.startListening()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'turn left' } }, { 0: { transcript: 'at the lights' } }] })
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'turn right' } }, { 0: { transcript: 'at the lights' } }] })
  expect(h.result).toHaveBeenLastCalledWith({ text: 'turn right at the lights', provider: 'browser', isFinal: false })
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'turn right' } }] })
  expect(h.result).toHaveBeenLastCalledWith({ text: 'turn right', provider: 'browser', isFinal: false })
  await h.provider.disconnect()
})

it('accepts a corrected late final after Finish until the browser ends', async () => {
  const h = setup()
  await h.provider.startListening()
  h.transcript()
  await h.provider.stopListening()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello, there.' }, isFinal: true }] })
  expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello, there.', provider: 'browser', isFinal: false })
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello, there.', provider: 'browser', isFinal: true })
  await vi.advanceTimersByTimeAsync(10000)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
})

it('keeps active speech open and gives resumed speech a new complete pause grace', async () => {
  const h = setup()
  await h.provider.startListening()
  h.transcript()
  await vi.advanceTimersByTimeAsync(1000)
  h.recognition.onspeechstart?.()
  await vi.advanceTimersByTimeAsync(5000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(1500)
  h.recognition.onspeechstart?.()
  await vi.advanceTimersByTimeAsync(3000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(1999)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  h.recognition.onend?.()
})

it('does not extend a speech pause for duplicate ends or delayed transcript revisions', async () => {
  const h = setup()
  await h.provider.startListening()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(1000)
  h.recognition.onspeechend?.()
  h.transcript()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there, again' } }] })
  await vi.advanceTimersByTimeAsync(1000)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello there, again', provider: 'browser', isFinal: true })
})

it('uses changed transcript inactivity when speech events never arrive, ignoring duplicates', async () => {
  const h = setup()
  await h.provider.startListening()
  h.transcript()
  await vi.advanceTimersByTimeAsync(1500)
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there again' } }] })
  await vi.advanceTimersByTimeAsync(1500)
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there again' } }] })
  await vi.advanceTimersByTimeAsync(500)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  h.recognition.onend?.()
})

it('settles an early browser end immediately and cancels any remaining pause grace', async () => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.recognition.onspeechend?.()
  const lateResult = h.recognition.onresult
  const duplicateEnd = h.recognition.onend
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello there', provider: 'browser', isFinal: true })
  expect(h.status).toHaveBeenLastCalledWith('idle')
  lateResult?.({ results: [{ 0: { transcript: 'stale revision' } }] })
  duplicateEnd?.()
  await vi.advanceTimersByTimeAsync(5000)
  expect(h.result).toHaveBeenCalledTimes(2)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  expect(h.audio.close).toHaveBeenCalledOnce()
})

it.each(['sampling', 'resume'] as const)('releases an externally ended meter track during %s and keeps transcription independent', async (phase) => {
  const h = setup()
  await h.provider.startListening()
  h.permission.resolve(h.stream)
  await h.flush()
  if (phase === 'sampling') { h.resume.resolve(); await h.flush(); await vi.advanceTimersByTimeAsync(50) }
  h.track.dispatchEvent(new Event('ended'))
  expect(h.levelUnavailable).toHaveBeenCalledOnce()
  expect(h.level.mock.calls.every(([value]) => value > 0)).toBe(true)
  expect(h.stopTrack).toHaveBeenCalledOnce()
  expect(h.audio.close).toHaveBeenCalledOnce()
  expect(h.source.disconnect).toHaveBeenCalledOnce()
  expect(h.meter.disconnect).toHaveBeenCalledOnce()
  const sampleCount = h.meter.getFloatTimeDomainData.mock.calls.length
  h.resume.resolve()
  await h.flush()
  await vi.advanceTimersByTimeAsync(500)
  expect(h.meter.getFloatTimeDomainData).toHaveBeenCalledTimes(sampleCount)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  expect(h.recognition.abort).not.toHaveBeenCalled()
  expect(h.status).not.toHaveBeenCalled()
  h.transcript()
  await h.provider.stopListening()
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Hello there', isFinal: true }))
  expect(h.error).not.toHaveBeenCalled()
  h.track.dispatchEvent(new Event('ended'))
})

it('removes track end handlers before intentionally stopping the meter', async () => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  h.stopTrack.mockImplementation(() => h.track.dispatchEvent(new Event('ended')))
  await h.provider.stopListening()
  expect(h.level).not.toHaveBeenCalled()
  expect(h.levelUnavailable).not.toHaveBeenCalled()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  h.recognition.onend?.()
})

it('rejects an already ended acquired meter track before creating audio resources', async () => {
  const h = setup()
  await h.provider.startListening()
  h.track.readyState = 'ended'
  h.permission.resolve(h.stream)
  await h.flush()
  expect(h.levelUnavailable).toHaveBeenCalledOnce()
  expect(h.level).not.toHaveBeenCalled()
  expect(h.audio.createAnalyser).not.toHaveBeenCalled()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  h.transcript()
  expect(h.result).toHaveBeenCalledOnce()
  await h.provider.disconnect()
  h.track.dispatchEvent(new Event('ended'))
})

it('does not report meter unavailability twice if resume rejects after its track ended', async () => {
  const h = setup()
  await h.provider.startListening()
  h.permission.resolve(h.stream)
  await h.flush()
  h.track.dispatchEvent(new Event('ended'))
  h.resume.reject(new Error('Audio context closed'))
  await h.flush()
  expect(h.levelUnavailable).toHaveBeenCalledOnce()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  expect(h.audio.close).toHaveBeenCalledOnce()
  await h.provider.disconnect()
})

it('honors a configured speech pause duration', async () => {
  const h = setup(3500)
  await h.provider.startListening()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(3499)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  await h.provider.disconnect()
  h.permission.resolve(h.stream)
  await h.flush()
})

it('detects silence without reporting amplitude when the waveform is disabled', async () => {
  const h = setup(2000, false)
  await h.provider.startListening()
  expect(h.getUserMedia).toHaveBeenCalledOnce()
  await h.ready()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  h.transcript()
  await vi.advanceTimersByTimeAsync(2050)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  expect(h.level).not.toHaveBeenCalled()
  expect(h.levelUnavailable).not.toHaveBeenCalled()
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith(expect.objectContaining({ isFinal: true }))
})

it.each([
  ['not-allowed', 'Allow microphone access'],
  ['network', 'connection'],
  ['audio-capture', 'Check your microphone'],
  ['service-not-allowed', 'Try Chrome'],
])('explains browser error %s with a recovery action', async (code, message) => {
  const h = setup(2000, false)
  await h.provider.startListening()
  h.recognition.onerror?.({ error: code })
  expect(h.error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ message: expect.stringContaining(message) }))
  expect(h.recognition.abort).toHaveBeenCalledOnce()
})

it('explains how to proceed when browser speech recognition is unsupported', () => {
  vi.stubGlobal('window', new EventTarget())
  expect(() => createBrowserDictationProvider(undefined)).toThrow('type your message')
})


it('finishes after resumed speech becomes silent even if the browser omits its second speechend', async () => {
  const h = setup(4000)
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  await vi.advanceTimersByTimeAsync(50)
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(2000)
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0.1))
  h.recognition.onspeechstart?.()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there again' } }] })
  await vi.advanceTimersByTimeAsync(6000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(4049)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello there, again.' } }] })
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith({ text: 'Hello there, again.', provider: 'browser', isFinal: true })
  expect(h.audio.close).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})

it('keeps quiet continuous measured speech open across delayed transcripts and misleading speechend', async () => {
  const h = setup(4000)
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0.006))
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  await vi.advanceTimersByTimeAsync(50)
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(12000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  await h.provider.disconnect()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not extend measured silence for delayed transcript corrections or duplicate speechend', async () => {
  const h = setup(4000)
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  await vi.advanceTimersByTimeAsync(50)
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(2050)
  h.recognition.onspeechend?.()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello, there' } }] })
  await vi.advanceTimersByTimeAsync(2000)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  h.recognition.onend?.()
  expect(h.result).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Hello, there', isFinal: true }))
})

it('does not start a silence deadline before any speech or transcript', async () => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(10000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  await h.provider.disconnect()
})

it.each(['suspended', 'muted', 'ended'] as const)('does not mistake an %s microphone meter for silence', async (kind) => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(1000)
  if (kind === 'suspended') h.audio.state = 'suspended'
  if (kind === 'muted') Object.assign(h.track, { muted: true })
  if (kind === 'ended') h.track.dispatchEvent(new Event('ended'))
  await vi.advanceTimersByTimeAsync(5000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  expect(h.levelUnavailable).toHaveBeenCalledOnce()
  if (kind !== 'ended') {
    h.audio.state = 'running'
    Object.assign(h.track, { muted: false })
    await vi.advanceTimersByTimeAsync(2050)
    expect(h.recognition.stop).toHaveBeenCalledOnce()
  }
  await h.provider.disconnect()
  expect(vi.getTimerCount()).toBe(0)
})

it('retains speech event timing when microphone measurement is denied', async () => {
  const h = setup()
  await h.provider.startListening()
  h.permission.reject(new Error('Microphone denied'))
  await h.flush()
  h.recognition.onspeechstart?.()
  h.transcript()
  await vi.advanceTimersByTimeAsync(6000)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(2000)
  expect(h.recognition.stop).toHaveBeenCalledOnce()
  h.recognition.onend?.()
})


it.each(['suspended', 'muted', 'ended'] as const)('checks meter availability at the silence deadline when %s between samples', async (kind) => {
  const h = setup()
  await h.provider.startListening()
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(2049)
  if (kind === 'suspended') h.audio.state = 'suspended'
  if (kind === 'muted') Object.assign(h.track, { muted: true })
  if (kind === 'ended') h.track.readyState = 'ended'
  await vi.advanceTimersByTimeAsync(1)
  expect(h.recognition.stop).not.toHaveBeenCalled()
  expect(h.levelUnavailable).toHaveBeenCalledOnce()
  await h.provider.disconnect()
})

it('settles measured auto-finish into review without sending and retains the browser final correction', async () => {
  const h = setup(4000)
  const callbacks = { onState: vi.fn(), onReview: vi.fn(), onSend: vi.fn() }
  const controller = new DictationController(callbacks)
  controller.start({ type: 'custom', custom: h.provider }, { autoSend: false })
  await vi.advanceTimersByTimeAsync(0)
  await h.ready()
  h.recognition.onspeechstart?.()
  h.transcript()
  h.recognition.onspeechend?.()
  await vi.advanceTimersByTimeAsync(50)
  h.recognition.onspeechstart?.()
  h.meter.getFloatTimeDomainData.mockImplementation((values) => values.fill(0))
  await vi.advanceTimersByTimeAsync(4050)
  expect(controller.getState().phase).toBe('processing')
  expect(callbacks.onSend).not.toHaveBeenCalled()
  h.recognition.onresult?.({ results: [{ 0: { transcript: 'Hello, there.' } }] })
  h.recognition.onend?.()
  expect(controller.getState()).toMatchObject({ phase: 'review', transcript: 'Hello, there.' })
  expect(callbacks.onReview).toHaveBeenCalledExactlyOnceWith('Hello, there.')
  expect(callbacks.onSend).not.toHaveBeenCalled()
  expect(h.stopTrack).toHaveBeenCalledOnce()
  controller.destroy()
  expect(vi.getTimerCount()).toBe(0)
})
