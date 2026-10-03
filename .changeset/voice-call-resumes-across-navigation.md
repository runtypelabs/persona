---
"@runtypelabs/persona": patch
---

A live voice call now resumes on the next page of a multi-page site: the widget records a full-duplex call as live (not only while its status is `listening`), re-stamps it on `pagehide` so long calls stay within the restore window, and redials immediately on load. When the browser blocks audio until the visitor interacts with the new page, the call no longer hangs: the widget asks for a mic tap to resume.
