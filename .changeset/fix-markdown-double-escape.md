---
"@runtypelabs/persona": patch
---

Fix double HTML-escaping of message text (e.g. apostrophes rendering as `&#39;`) while the markdown/DOMPurify chunk is still loading — or fails to load — in the IIFE/CDN build. The render layer no longer re-runs the sanitizer over already-escaped output, so degraded mode escapes exactly once.
