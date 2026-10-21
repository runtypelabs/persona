## Persona verification

<sub>branch `fix/plain-assistant-brand-elevation` · captured at `d0c15abc9d + uncommitted changes (46e038b27465)` · run `20261021-204734-972eec` · apps/web vite dev (widget from source), keyless fixture</sub>

| Feature | Result | Note |
| --- | --- | --- |
| launcher-and-theme | ✅ verified | V5 Studio/Terminal light and dark preserve plain assistant prose; V4 dark retains elevated cards. Real sends verify plain compact replies and custom padded bubbles with brand shadows, each with one request and completed assistant/run events. V4 light and custom dark bubbles covered by unit tests only; other launcher/layout entry points not driven. |

### launcher-and-theme

**V5 Studio and Terminal compared with V4**

<img src="./01-launcher-and-theme-v5-studio-and-terminal-compared-with-v4.gif" alt="V5 Studio and Terminal compared with V4" width="640">

<img src="./01-launcher-and-theme-v5-studio-and-terminal-compared-with-v4.contact-sheet.png" alt="V5 Studio and Terminal compared with V4" width="640">

[`01-launcher-and-theme-v5-studio-and-terminal-compared-with-v4.webm`](./01-launcher-and-theme-v5-studio-and-terminal-compared-with-v4.webm)

**V5 default dark baseline**: Captured before selecting Studio.

<img src="./02-launcher-and-theme-v5-studio-dark.png" alt="V5 default dark baseline" width="640">

[`02-launcher-and-theme-v5-studio-dark.aria.txt`](./02-launcher-and-theme-v5-studio-dark.aria.txt)

**V5 Studio dark verified**

<img src="./03-launcher-and-theme-v5-studio-dark-verified.png" alt="V5 Studio dark verified" width="640">

[`03-launcher-and-theme-v5-studio-dark-verified.aria.txt`](./03-launcher-and-theme-v5-studio-dark-verified.aria.txt)

**V5 Studio light**

<img src="./04-launcher-and-theme-v5-studio-light.png" alt="V5 Studio light" width="640">

[`04-launcher-and-theme-v5-studio-light.aria.txt`](./04-launcher-and-theme-v5-studio-light.aria.txt)

**V5 Terminal light**

<img src="./05-launcher-and-theme-v5-terminal-light.png" alt="V5 Terminal light" width="640">

[`05-launcher-and-theme-v5-terminal-light.aria.txt`](./05-launcher-and-theme-v5-terminal-light.aria.txt)

**V5 Terminal dark**

<img src="./06-launcher-and-theme-v5-terminal-dark.png" alt="V5 Terminal dark" width="640">

[`06-launcher-and-theme-v5-terminal-dark.aria.txt`](./06-launcher-and-theme-v5-terminal-dark.aria.txt)

**V4 Terminal dark elevated replies**

<img src="./07-launcher-and-theme-v4-terminal-dark-elevated-replies.png" alt="V4 Terminal dark elevated replies" width="640">

[`07-launcher-and-theme-v4-terminal-dark-elevated-replies.aria.txt`](./07-launcher-and-theme-v4-terminal-dark-elevated-replies.aria.txt)

**V4 Studio dark elevated replies**

<img src="./08-launcher-and-theme-v4-studio-dark-elevated-replies.png" alt="V4 Studio dark elevated replies" width="640">

[`08-launcher-and-theme-v4-studio-dark-elevated-replies.aria.txt`](./08-launcher-and-theme-v4-studio-dark-elevated-replies.aria.txt)

**Custom padded assistant bubble follows raised elevation**

<img src="./09-launcher-and-theme-custom-padded-assistant-bubble-follows-raised-el.gif" alt="Custom padded assistant bubble follows raised elevation" width="640">

<img src="./09-launcher-and-theme-custom-padded-assistant-bubble-follows-raised-el.contact-sheet.png" alt="Custom padded assistant bubble follows raised elevation" width="640">

[`09-launcher-and-theme-custom-padded-assistant-bubble-follows-raised-el.webm`](./09-launcher-and-theme-custom-padded-assistant-bubble-follows-raised-el.webm)

**Custom padded assistant bubble with brand shadow**

<img src="./10-launcher-and-theme-custom-padded-assistant-bubble-with-brand-shadow.png" alt="Custom padded assistant bubble with brand shadow" width="640">

[`10-launcher-and-theme-custom-padded-assistant-bubble-with-brand-shadow.aria.txt`](./10-launcher-and-theme-custom-padded-assistant-bubble-with-brand-shadow.aria.txt)

**Custom bubble during streaming**: 1 request(s) crossed the network boundary, 3 controller event(s)

[`11-launcher-and-theme-custom-bubble-completed-conversation.page.json`](./11-launcher-and-theme-custom-bubble-completed-conversation.page.json)

**Plain V5 assistant at compact density with raised brand**

<img src="./12-launcher-and-theme-plain-v5-assistant-at-compact-density-with-raise.gif" alt="Plain V5 assistant at compact density with raised brand" width="640">

<img src="./12-launcher-and-theme-plain-v5-assistant-at-compact-density-with-raise.contact-sheet.png" alt="Plain V5 assistant at compact density with raised brand" width="640">

[`12-launcher-and-theme-plain-v5-assistant-at-compact-density-with-raise.webm`](./12-launcher-and-theme-plain-v5-assistant-at-compact-density-with-raise.webm)

**Plain V5 assistant after a real send**

<img src="./13-launcher-and-theme-plain-v5-assistant-after-a-real-send.png" alt="Plain V5 assistant after a real send" width="640">

[`13-launcher-and-theme-plain-v5-assistant-after-a-real-send.aria.txt`](./13-launcher-and-theme-plain-v5-assistant-after-a-real-send.aria.txt)

**Plain V5 during streaming**: 1 request(s) crossed the network boundary, 3 controller event(s)

[`14-launcher-and-theme-plain-v5-completed-conversation.page.json`](./14-launcher-and-theme-plain-v5-completed-conversation.page.json)

**Plain V5 reply finished**

<img src="./15-launcher-and-theme-plain-v5-reply-finished.png" alt="Plain V5 reply finished" width="640">

[`15-launcher-and-theme-plain-v5-reply-finished.aria.txt`](./15-launcher-and-theme-plain-v5-reply-finished.aria.txt)

**Plain V5 finished request and events**: 1 request(s) crossed the network boundary, 5 controller event(s)

[`16-launcher-and-theme-plain-v5-finished-request-and-events.page.json`](./16-launcher-and-theme-plain-v5-finished-request-and-events.page.json)

**Custom assistant bubble complete send**

<img src="./17-launcher-and-theme-custom-assistant-bubble-complete-send.gif" alt="Custom assistant bubble complete send" width="640">

<img src="./17-launcher-and-theme-custom-assistant-bubble-complete-send.contact-sheet.png" alt="Custom assistant bubble complete send" width="640">

[`17-launcher-and-theme-custom-assistant-bubble-complete-send.webm`](./17-launcher-and-theme-custom-assistant-bubble-complete-send.webm)

**Custom padded assistant reply finished**

<img src="./18-launcher-and-theme-custom-padded-assistant-reply-finished.png" alt="Custom padded assistant reply finished" width="640">

[`18-launcher-and-theme-custom-padded-assistant-reply-finished.aria.txt`](./18-launcher-and-theme-custom-padded-assistant-reply-finished.aria.txt)

**Custom bubble finished request and events**: 1 request(s) crossed the network boundary, 5 controller event(s)

[`19-launcher-and-theme-custom-bubble-finished-request-and-events.page.json`](./19-launcher-and-theme-custom-bubble-finished-request-and-events.page.json)

