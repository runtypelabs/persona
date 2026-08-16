---
"@runtypelabs/persona": patch
---

Stop the header from changing height when Messages opens or closes. The shell now measures the header before swapping its contents for the Messages bar and pins that height for the duration, with the bar vertically centered in the preserved box, so the swap causes no layout shift below the chrome. The pin survives header rebuilds while Messages is open and clears on close.
