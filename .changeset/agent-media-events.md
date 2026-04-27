---
"@runtypelabs/persona": minor
---

Handle the new `agent_media` SSE event so tool-produced media (images, audio, video, files) renders inline in the chat at the point the tool completed. Wire format follows the AI SDK v3/v4/v6 `MediaContentPart` shape (`{ type: 'media' | 'image-url' | 'file-url' }`); `mediaType` drives routing to the right rendering bucket. Adds `AudioContentPart` and `VideoContentPart` to the public types and renders `<audio>`/`<video>` controls plus file download links in message bubbles.
