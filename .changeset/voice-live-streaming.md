---
"@runtypelabs/persona": minor
---

Full-duplex voice (GPT-Live) now streams handed-off answers. When the server supports it (`delegation_stream` together with `delegation_read_back`), the widget sends the delegated turn's answer to the voice model in sentence-sized `delegation_delta` pieces while it renders, so speech starts before the agent finishes. The terminal frame then carries `streamedChars`, and an approval script is sent as the unstreamed rest. The widget folds the voice model's read-back on the server's first `delegation_progress`. Delegated chat requests carry `voice: { spoken: true }` so the agent answers in speakable sentences.
