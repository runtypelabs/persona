---
"@runtypelabs/persona": minor
---

**Default scroll behavior changed: `anchor-top` is now the default.**

The streaming transcript now defaults to `features.scrollBehavior.mode: "anchor-top"` (ChatGPT-style: the sent message pins near the top of the viewport and the reply streams into the space below) instead of `"follow"` (stick to the bottom). The unread-count + "streaming below" hint (`showActivityWhilePinned`) also now defaults **on**, so activity arriving off-screen under the pinned turn stays visible.

Turns with no user send to anchor to — a proactive greeting, an injected assistant message, a resubmit, or first-load streaming — automatically fall back to follow-to-bottom for that turn, so content never streams in off-screen.

**To restore the previous behavior**, set the mode explicitly:

```js
initAgentWidget({
  config: {
    features: { scrollBehavior: { mode: "follow" } },
  },
});
```

To keep `anchor-top` but silence the pinned-turn activity hint, set `features.scrollBehavior.showActivityWhilePinned: false`.
