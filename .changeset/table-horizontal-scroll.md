---
"@runtypelabs/persona": patch
---

Wide markdown tables now scroll horizontally inside their own container instead of pushing the whole chat column wide. Each table is wrapped in a scroll region with edge fades that appear only when there is more content to scroll toward, so tables stay contained and readable on narrow layouts. While a table streams in, it now scrolls at its natural width with columns locked to the header row, instead of being squeezed to fit the column and only becoming scrollable once streaming finished.
