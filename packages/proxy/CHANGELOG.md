# @runtypelabs/persona-proxy

## 1.36.1

### Patch Changes

- 8f6b68a: Add ESLint configuration files for proper linting support
- 8f6b68a: Migrate package to @runtypelabs organization

  - Renamed from vanilla-agent to @runtypelabs/persona
  - Updated all CSS selectors and DOM IDs to use persona prefix
  - Updated localStorage keys and event names

## 1.36.0

### Minor Changes

- Improve code gen with client token

## 1.35.0

### Minor Changes

- Enable tooltip colors to be configurable

## 1.34.0

### Minor Changes

- Add attachment functionality

## 1.33.0

### Minor Changes

- Add more control over script generation

## 1.32.0

### Minor Changes

- Add ability to persist session id

## 1.31.0

### Minor Changes

- Update message event listeners and add config for header/footer visibility

## 1.30.0

### Minor Changes

- Use idiomorph for dom updates to prevent animation flicker

## 1.29.0

### Minor Changes

- Replace CSS that may conflict with parent page styles

## 1.28.0

### Minor Changes

- Move load css to be inside hydration function

## 1.27.0

### Minor Changes

- Additional hydration support within advanced script export

## 1.26.0

### Minor Changes

- Update advanced script export to support sites that hydrate dom

## 1.25.0

### Minor Changes

- Support for dark mode theme

## 1.24.0

### Minor Changes

- Enable tool call, message action, markdown, and layout config in code export

## 1.23.0

### Minor Changes

- Add feedback api support and include metadata in the chat message requests

## 1.22.0

### Minor Changes

- Message feedback mechanisms and client token support

## 1.21.0

### Minor Changes

- Improved markdown and launcher button styling

## 1.20.0

### Minor Changes

- Add panel height offset config

## 1.19.0

### Minor Changes

- Improve inline embed width and flex config

## 1.18.0

### Minor Changes

- Fix layout shift in inline embed

## 1.17.0

### Minor Changes

- Fix theme apply issue

## 1.16.0

### Minor Changes

- Add theme config reference and resolve embedded overflow issue

## 1.15.0

### Minor Changes

- Resolve rendering issues when in full height and sidebar mode

## 1.14.0

### Minor Changes

- Improve user message ux and markdown styling for lists and paragraphs

## 1.13.0

### Minor Changes

- Add markdown parsing to script generation
- Remove extra action-middleware example
- Fix lagging typing indicator after assistant message

## 1.12.0

### Minor Changes

- Add code generation methods to library export

## 1.11.0

### Minor Changes

- Improve responsiveness of inline rendering, enable sidebar rendering, and use custom components for form demo

## 1.10.0

### Minor Changes

Added:

- Component streaming hooks
- Custom fetch / header / sse parsing methods

Improved:

- Vanilla Agent DOM is now excluded from page DOM helper

Fixed

- Missed triggering of checkout middleware actions
- Duplicate triggering of click and checkout actions

## 1.9.0

### Minor Changes

- improve usability of theme presets and script generation

## 1.8.0

### Minor Changes

- Widget state events, message persistance control, and shop demo styling

## 1.7.0

### Minor Changes

- resolve test issues, simplify action middleware, and enable upstream url in proxy to be configured more easily

## 1.6.0

### Minor Changes

- added event handlers and middleware hooks

## 1.5.0

### Minor Changes

- add z-index to launcher

## 1.4.0

### Minor Changes

- implement stream parsing plugin system

## 1.3.0

### Minor Changes

- added viaVoice field to user message in send message

## 1.2.0

### Minor Changes

- added message and voice input hooks

## 1.1.0

### Minor Changes

- b7124ae: update proxy examples for vercel and cloudflare

## 1.0.0

### Major Changes

- e64d029: Initial version 😎

  Updated core interface and unified default style definitions, while adding much more configurability of elements.

## 0.2.0

### Minor Changes

- 1b91c6a: renamed packages to ones that are available on npm
