---
"@runtypelabs/persona": patch
---

Adapt browser dictation silence detection to ambient microphone noise, reject brief clicks, and preserve the previous fixed threshold through `dictation.provider.browser.activityDetection: 'fixed'`.
