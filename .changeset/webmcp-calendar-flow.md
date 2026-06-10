---
"@runtypelabs/persona-proxy": minor
---

Add `WEBMCP_CALENDAR_FLOW`, an in-code flow template for the webmcp-calendar example. Like `WEBMCP_STOREFRONT_FLOW`, the agent owns no tools of its own — the page registers ten calendar tools on `document.modelContext` and the widget forwards them as `clientTools[]`. The system prompt reinforces the page's timezone-safe tool contract (local wall-clock `YYYY-MM-DDTHH:mm` date-times, no UTC offsets).
