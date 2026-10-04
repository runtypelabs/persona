# Launcher, layout and theme

The widget mounts either inline in a host element or as a floating launcher that opens a panel. Light and dark color schemes, and any config option, change its look. This is where most "what does it look like now" PR evidence comes from.

## Sub-features

- `launcher-open`: clicking the launcher opens the panel, and the controller emits `widget:opened`.
- `launcher-close`: `Close chat` closes it (`widget:closed`).
- `inline`: the panel fills `#verify-host` with no launcher.
- `dark`: `colorScheme: "dark"` on the widget and the page.
- `config-override`: any `AgentWidgetConfig` patch, for the option a PR adds or changes.

## How to get to it (user POV)

1. On a site with a launcher, the visitor clicks the floating button (accessible name = title + subtitle, e.g. "Verify fixture Here to help you get answers fast").
2. They chat in the panel, then close it with the header's `Close chat`.

## Driving it with control-persona + agent-browser

Preconditions: `ctl open verify --mode launcher [--theme dark] [--config '<json>']`.

- **Closed state:** `ctl shot launcher-and-theme "launcher closed"`.
- **Open:** `ctl ab find role button click --name "Verify fixture"`, then `ctl ab wait --text "Send a message"`. Observe: the panel and the header `Close chat`.
- **Close:** `ctl ab find role button click --name "Close chat"`.
- **Events:** `ctl capture launcher-and-theme "open close"`. Expect `widget:opened`, then `widget:closed`, both with `source: "user"`.
- **Before/after of a config change:** shoot the same scenario twice, `ctl open verify --theme dark` and `ctl open verify --theme dark --config '{"theme":{…}}'`, as two `shot`s with the same feature id.

## Gotchas

- `--config` is JSON in one shell argument; quote it with single quotes. Arrays replace and objects deep-merge.
- In launcher mode the panel's controls are in the ARIA tree while it's closed, so don't use `snapshot` to prove open or closed: use the screenshot and the `widget:*` events.
- The deferred-launcher installer path (`install.global.js` / `launcher.global.js`) is not exercised here; it needs a built `dist`. Use `apps/web/standalone/example-shop-installer.html` after `pnpm build:widget`.

## Source

`packages/widget/src/components/launcher.ts`, `components/header-parts.ts`, `runtime/init.ts`, `utils/theme.ts`, `defaults.ts`.
