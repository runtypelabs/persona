export interface BrowserRecognitionEvent {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  error?: string;
}

/** Transcription handlers are lazy; the UI still starts recognition in the click gesture. */
export function createBrowserRecognitionHandlers(options: {
  textarea: HTMLTextAreaElement;
  initialText: string;
  pauseDuration: number;
  isActive: () => boolean;
  syncText: () => void;
  stop: () => void;
  review: () => boolean;
  submit: () => void;
}) {
  let pauseTimer: number | null = null;
  const result = (event: BrowserRecognitionEvent) => {
    if (!options.isActive()) return;
    // Build the complete transcript from all results
    let fullTranscript = "";
    let interimTranscript = "";

    // Process all results from the beginning
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;

      if (result.isFinal) {
        fullTranscript += transcript + " ";
      } else {
        // Only take the last interim result
        interimTranscript = transcript;
      }
    }

    // Update textarea with initial text + full transcript + interim
    const newValue = options.initialText + fullTranscript + interimTranscript;
    options.textarea.value = newValue;
    // Programmatic write: no input event fires, so mirror it explicitly.
    options.syncText();

    // Reset pause timer on each result
    if (pauseTimer) {
      clearTimeout(pauseTimer);
    }

    // Set timer to auto-submit after pause when we have any speech
    if (fullTranscript || interimTranscript) {
      pauseTimer = window.setTimeout(() => {
        const finalValue = options.textarea.value.trim();
        if (finalValue && options.isActive()) {
          options.stop();
          // `review`: the transcript is already in the composer (and the
          // store); leave it there for the user to edit and send.
          if (options.review()) return;
          // Route through the normal submit path so mentions are collected +
          // cleared like a manual send (the transcript already lives in the
          // composer). Sending directly would leave stale tracked mention
          // context to attach to the next unrelated message.
          options.submit();
        }
      }, options.pauseDuration);
    }
  };

  const error = (event: BrowserRecognitionEvent) => {
    if (!options.isActive()) return;
    // Don't stop on "no-speech" error, just ignore it
    if (event.error !== 'no-speech') {
      options.stop();
    }
  };

  const end = () => {
    if (!options.isActive()) return;
    // If recognition ended naturally (not manually stopped), submit if there's text
    if (options.isActive()) {
      const finalValue = options.textarea.value.trim();
      if (
        !options.review() &&
        finalValue &&
        finalValue !== options.initialText.trim()
      ) {
        // Route through the normal submit path (mentions collect + clear), same
        // as the pause-timer branch above.
        options.submit();
      }
      options.stop();
    }
  };

  return { result, error, end, dispose: () => {
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = null;
  } };
}
