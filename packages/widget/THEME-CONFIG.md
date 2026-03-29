# Widget Theme & Configuration Reference

This document provides definitions of all themable configuration options for Persona Widget v2.0.

## Theme Architecture

The v2 theme system uses a **three-layer token architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     COMPONENT TOKENS                        │
│  button.background, launcher.size, panel.borderRadius       │
├─────────────────────────────────────────────────────────────┤
│                    SEMANTIC TOKENS                          │
│  colors.primary, colors.text, spacing.md, typography.base   │
├─────────────────────────────────────────────────────────────┤
│                      BASE TOKENS                            │
│  palette.colors.blue.500, palette.spacing.4, palette.radius │
└─────────────────────────────────────────────────────────────┘
```

- **Palette** — Raw design values (color scales, spacing, typography, shadows, radii)
- **Semantic** — Intent-based tokens that reference palette values (e.g., `primary`, `surface`, `text`)
- **Components** — Component-specific tokens that reference semantic or palette values

Token references are resolved at runtime:

```
semantic.colors.primary → palette.colors.primary.500 → #171717
```

## Quick Start

### Simple Color Override

```typescript
initAgentWidget({
  target: '#chat',
  config: {
    theme: {
      palette: {
        colors: {
          primary: { 500: '#7c3aed', 600: '#6d28d9' }
        }
      }
    }
  }
});
```

### Using the Theme API

```typescript
import { createTheme, brandPlugin, accessibilityPlugin } from '@runtypelabs/persona';

const theme = createTheme({
  palette: {
    colors: {
      primary: { 500: '#7c3aed' }
    }
  },
  semantic: {
    colors: {
      primary: 'palette.colors.primary.500',
      surface: 'palette.colors.gray.50'
    }
  }
}, {
  plugins: [
    accessibilityPlugin(),
    brandPlugin({ colors: { primary: '#7c3aed' } })
  ]
});

initAgentWidget({
  config: { theme }
});
```

### Flat v1 themes (removed)

`config.theme` / `config.darkTheme` must be **`DeepPartial<PersonaTheme>`** (`palette` / `semantic` / `components`). The old flat v1 object shape is **not** supported: there is no runtime migration and no `migrateV1Theme` helper. Port themes to the token tree (see **Breaking Changes from v1** below).

---

## Dark Mode Support

### Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `theme` | `DeepPartial<PersonaTheme>` | (light defaults) | Theme tokens for light mode |
| `colorScheme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color scheme mode |

### Color Scheme Modes

- **`'light'`** (default): Always use light palette
- **`'dark'`**: Always use dark palette (inverted grays)
- **`'auto'`**: Detect from page settings and switch automatically

### Auto Detection Order

When `colorScheme: 'auto'`, the widget detects dark mode by:
1. Checking if `<html>` has `dark` class (e.g., `<html class="dark">`)
2. Falling back to `prefers-color-scheme: dark` media query

The widget automatically updates when:
- The `dark` class is added/removed from `<html>`
- System color scheme preference changes

### Usage Examples

**Auto-detection with custom colors:**

```typescript
initAgentWidget({
  target: '#chat',
  config: {
    colorScheme: 'auto',
    theme: {
      palette: {
        colors: {
          primary: { 500: '#6366f1', 600: '#4f46e5' }
        }
      }
    }
  }
});
```

**Runtime theme switching:**

```typescript
const controller = initAgentWidget({
  target: '#chat',
  config: { colorScheme: 'auto' }
});

// Switch to forced dark mode
controller.update({ colorScheme: 'dark' });

// Switch back to auto-detection
controller.update({ colorScheme: 'auto' });
```

---

## Palette Tokens (`theme.palette.*`)

### Color Scales (`palette.colors.*`)

Each color has shades from 50 (lightest) to 950 (darkest):

| Scale | Colors |
|-------|--------|
| `primary` | Main brand color (default: blue) |
| `secondary` | Secondary color (default: purple) |
| `accent` | Accent color (default: cyan) |
| `gray` | Neutral grays |
| `success` | Success states (default: green) |
| `warning` | Warning states (default: yellow) |
| `error` | Error states (default: red) |

```typescript
palette: {
  colors: {
    primary: {
      50: '#ffffff', 100: '#f5f5f5', 200: '#d4d4d4',
      300: '#a3a3a3', 400: '#737373', 500: '#171717',
      600: '#0f0f0f', 700: '#0a0a0a', 800: '#050505',
      900: '#030303', 950: '#000000'
    }
  }
}
```

### Spacing (`palette.spacing.*`)

| Key | Value |
|-----|-------|
| `0` | `0px` |
| `1` | `0.25rem` |
| `2` | `0.5rem` |
| `3` | `0.75rem` |
| `4` | `1rem` |
| `6` | `1.5rem` |
| `8` | `2rem` |
| `12` | `3rem` |

### Typography (`palette.typography.*`)

| Key | Values |
|-----|--------|
| `fontFamily` | `sans`, `serif`, `mono` |
| `fontSize` | `xs` (0.75rem), `sm` (0.875rem), `base` (1rem), `lg`, `xl`, `2xl`, `3xl`, `4xl` |
| `fontWeight` | `normal` (400), `medium` (500), `semibold` (600), `bold` (700) |
| `lineHeight` | `tight` (1.25), `normal` (1.5), `relaxed` (1.625) |

### Shadows (`palette.shadows.*`)

| Key | Description |
|-----|-------------|
| `none` | No shadow |
| `sm` | Subtle shadow |
| `md` | Medium shadow |
| `lg` | Large shadow |
| `xl` | Extra-large shadow |
| `2xl` | Maximum shadow |

### Radius (`palette.radius.*`)

| Key | Value |
|-----|-------|
| `none` | `0px` |
| `sm` | `0.125rem` |
| `md` | `0.375rem` |
| `lg` | `0.5rem` |
| `xl` | `0.75rem` |
| `2xl` | `1rem` |
| `full` | `9999px` |

---

## Semantic Tokens (`theme.semantic.*`)

Semantic tokens provide intent-based naming that references palette values.

### Colors (`semantic.colors.*`)

| Token | Default Reference | Description |
|-------|-------------------|-------------|
| `primary` | `palette.colors.primary.500` | Primary brand color |
| `secondary` | `palette.colors.gray.500` | Secondary color |
| `accent` | `palette.colors.primary.600` | Accent/interactive color |
| `surface` | `palette.colors.gray.50` | Panel/card backgrounds |
| `background` | `palette.colors.gray.50` | Page background |
| `container` | `palette.colors.gray.100` | Container backgrounds |
| `text` | `palette.colors.gray.900` | Primary text |
| `textMuted` | `palette.colors.gray.500` | Muted/secondary text |
| `textInverse` | `palette.colors.gray.50` | Text on dark backgrounds |
| `border` | `palette.colors.gray.200` | Default border color |
| `divider` | `palette.colors.gray.200` | Divider lines |

### Interactive States (`semantic.colors.interactive.*`)

| Token | Default Reference |
|-------|-------------------|
| `default` | `palette.colors.primary.500` |
| `hover` | `palette.colors.primary.600` |
| `focus` | `palette.colors.primary.700` |
| `active` | `palette.colors.primary.800` |
| `disabled` | `palette.colors.gray.300` |

### Feedback Colors (`semantic.colors.feedback.*`)

| Token | Default Reference |
|-------|-------------------|
| `success` | `palette.colors.success.500` |
| `warning` | `palette.colors.warning.500` |
| `error` | `palette.colors.error.500` |
| `info` | `palette.colors.primary.500` |

### Spacing (`semantic.spacing.*`)

| Token | Default Reference |
|-------|-------------------|
| `xs` | `palette.spacing.1` (0.25rem) |
| `sm` | `palette.spacing.2` (0.5rem) |
| `md` | `palette.spacing.4` (1rem) |
| `lg` | `palette.spacing.6` (1.5rem) |
| `xl` | `palette.spacing.8` (2rem) |
| `2xl` | `palette.spacing.10` (2.5rem) |

---

## Component Tokens (`theme.components.*`)

### Button (`components.button.*`)

| Variant | Properties |
|---------|-----------|
| `primary` | `background`, `foreground`, `borderRadius`, `padding` |
| `secondary` | `background`, `foreground`, `borderRadius`, `padding` |
| `ghost` | `background`, `foreground`, `borderRadius`, `padding` |

### Input (`components.input.*`)

| Token | Default Reference |
|-------|-------------------|
| `background` | `semantic.colors.surface` |
| `placeholder` | `semantic.colors.textMuted` |
| `focus.border` | `semantic.colors.interactive.focus` |
| `focus.ring` | `semantic.colors.interactive.focus` |

### Launcher (`components.launcher.*`)

| Token | Default |
|-------|---------|
| `size` | `60px` |
| `iconSize` | `28px` |
| `borderRadius` | `palette.radius.full` |
| `shadow` | `palette.shadows.lg` |

### Panel (`components.panel.*`)

| Token | Default |
|-------|---------|
| `width` | `min(400px, calc(100vw - 24px))` |
| `maxWidth` | `400px` |
| `height` | `600px` |
| `maxHeight` | `calc(100vh - 80px)` |
| `borderRadius` | `palette.radius.xl` |
| `shadow` | `palette.shadows.xl` |

### Header (`components.header.*`)

| Token | Default Reference |
|-------|-------------------|
| `background` | `semantic.colors.surface` |
| `border` | `semantic.colors.border` |
| `borderRadius` | `palette.radius.xl palette.radius.xl 0 0` |
| `padding` | `semantic.spacing.md` |

### Message (`components.message.*`)

| Token | Default Reference |
|-------|-------------------|
| `user.background` | `semantic.colors.primary` |
| `user.text` | `semantic.colors.textInverse` |
| `user.borderRadius` | `palette.radius.lg` |
| `assistant.background` | `semantic.colors.container` |
| `assistant.text` | `semantic.colors.text` |
| `assistant.borderRadius` | `palette.radius.lg` |

### Voice (`components.voice.*`)

| Token | Default Reference |
|-------|-------------------|
| `recording.indicator` | `palette.colors.error.500` |
| `recording.background` | `palette.colors.error.50` |
| `recording.border` | `palette.colors.error.200` |
| `processing.icon` | `palette.colors.primary.500` |
| `processing.background` | `palette.colors.primary.50` |
| `speaking.icon` | `palette.colors.success.500` |

### Approval (`components.approval.*`)

| Token | Default Reference |
|-------|-------------------|
| `requested.background` | `palette.colors.warning.50` |
| `requested.border` | `palette.colors.warning.200` |
| `requested.text` | `palette.colors.gray.900` |
| `approve.background` | `palette.colors.success.500` |
| `approve.foreground` | `palette.colors.gray.50` |
| `deny.background` | `palette.colors.error.500` |
| `deny.foreground` | `palette.colors.gray.50` |

### Attachment (`components.attachment.*`)

| Token | Default Reference |
|-------|-------------------|
| `image.background` | `palette.colors.gray.100` |
| `image.border` | `palette.colors.gray.200` |

---

## Plugin System

Plugins transform theme tokens before they are resolved.

```typescript
import { createTheme, createPlugin } from '@runtypelabs/persona';

const myPlugin = createPlugin({
  name: '@mycompany/persona-theme',
  version: '1.0.0',
  transform(theme) {
    return { ...theme, /* modifications */ };
  },
  cssVariables: {
    '--company-brand': '#ff0000'
  },
  afterResolve(resolved) {
    return { ...resolved, /* post-processing */ };
  }
});

const theme = createTheme(undefined, { plugins: [myPlugin] });
```

### Built-in Plugins

| Plugin | Description |
|--------|-------------|
| `accessibilityPlugin()` | Enhanced focus indicators and disabled states |
| `animationsPlugin()` | Adds transition and easing tokens |
| `brandPlugin({ colors: { primary: '#hex' } })` | Auto-generates color scales from a single brand color |
| `reducedMotionPlugin()` | Disables all animations (sets transitions to 0ms) |
| `highContrastPlugin()` | Enhances contrast for visual accessibility |

---

## CSS Variables

### Naming Convention

All CSS variables use the `--persona-` prefix:

```
palette.colors.primary.500     → --persona-palette-colors-primary-500
semantic.colors.primary        → --persona-semantic-colors-primary
components.button.background   → --persona-components-button-background
```

### Convenience Aliases

Common tokens have short aliases for easier use in custom CSS:

```css
--persona-primary         /* semantic.colors.primary */
--persona-secondary       /* semantic.colors.secondary */
--persona-accent          /* semantic.colors.accent */
--persona-surface         /* semantic.colors.surface */
--persona-background      /* semantic.colors.background */
--persona-container       /* semantic.colors.container */
--persona-text            /* semantic.colors.text */
--persona-text-muted      /* semantic.colors.textMuted */
--persona-text-inverse    /* semantic.colors.textInverse */
--persona-border          /* semantic.colors.border */
--persona-divider         /* semantic.colors.divider */
--persona-muted           /* alias for --persona-text-muted */
```

### Voice Aliases

```css
--persona-voice-recording-indicator
--persona-voice-recording-bg
--persona-voice-processing-icon
--persona-voice-speaking-icon
```

### Approval Aliases

```css
--persona-approval-bg
--persona-approval-border
--persona-approval-text
--persona-approval-approve-bg
--persona-approval-deny-bg
```

### Attachment Aliases

```css
--persona-attachment-image-bg
--persona-attachment-image-border
```

---

## Launcher (`config.launcher.*`)

### Basic
| Property | Description |
|----------|-------------|
| `enabled` | Show/hide the launcher button |
| `title` | Header title text |
| `subtitle` | Header subtitle text |
| `textHidden` | Hide title/subtitle on launcher |
| `iconUrl` | Custom launcher icon URL |
| `position` | `"bottom-right" \| "bottom-left" \| "top-right" \| "top-left"` |
| `autoExpand` | Auto-open widget on page load |
| `width` | Chat panel width |
| `mountMode` | `"floating" \| "docked"` |

### Full Height & Sidebar
| Property | Default | Description |
|----------|---------|-------------|
| `fullHeight` | `false` | Fill full height of container |
| `sidebarMode` | `false` | Position as sidebar flush with viewport |
| `sidebarWidth` | `"420px"` | Sidebar width |
| `heightOffset` | `0` | Pixel offset to subtract from calculated panel height |

### Docked Panel
| Property | Default | Description |
|----------|---------|-------------|
| `dock.side` | `"right"` | Which side of the wrapped target container the panel should appear on |
| `dock.width` | `"420px"` | Expanded dock width when open |
| `dock.animate` | `true` | When `false`, open/close snaps with no CSS transition (`resize`: width; `overlay` / `push`: transform on panel or track) |
| `dock.reveal` | `"resize"` | `"resize"`: flex column `0` ↔ `width` (panel fills the slot, so it stretches during the animation). `"emerge"`: same column animation and **content reflow**, but the chat UI stays **`dock.width`** wide and is **clipped** by the slot (full-width floating-style entrance). `"overlay"`: overlay + `transform`. `"push"`: sliding track (Shopify-style) |

When `mountMode` is `"docked"`, `initAgentWidget({ target })` wraps the target container and renders Persona in a sibling dock slot. `body` and `html` are not valid targets. `position`, `fullHeight`, and `sidebarMode` are ignored in docked mode. With `dock.reveal: "resize"`, a closed dock uses a **`0px`** column; with `"overlay"` or `"push"`, layout uses transforms instead of shrinking the main column during the animation. The floating launcher stays hidden in docked mode—use `controller.open()` or your own trigger.

**Scoping push/overlay:** Only the subtree under `target` is wrapped. Put **headers, sidebars, or settings chrome** *outside* that element (siblings in your layout) when you want them fixed; point `target` at the inner column or canvas that should move with the dock (see `examples/embedded-app` docked demo: `#workspace-dock-target`). For **`dock.side: "left"`**, keep the rail **in normal flow beside the dock stage** (e.g. flex row `[nav | stage]`) so the panel does not paint **under** a floating rail. For a **right** dock, an optional **full-width stage** with an **absolutely positioned** left rail can let push translate the canvas **behind** a persistent sidebar (Shopify-style). The embedded dock demo toggles between those two chrome layouts using `data-dock-side` on `#workspace-main`.

**Breaking change:** `dock.collapsedWidth` was removed; a collapsed rail is no longer configurable.

### Agent Icon
| Property | Description |
|----------|-------------|
| `agentIconText` | Emoji/text for agent icon |
| `agentIconName` | Icon name |
| `agentIconHidden` | Hide agent icon |
| `agentIconSize` | Icon size |

### Call to Action Icon
| Property | Description |
|----------|-------------|
| `callToActionIconText` | Emoji/text for CTA |
| `callToActionIconName` | Icon name |
| `callToActionIconColor` | Icon color |
| `callToActionIconBackgroundColor` | Background color |
| `callToActionIconHidden` | Hide CTA icon |
| `callToActionIconPadding` | Padding |
| `callToActionIconSize` | Size |

### Launcher Styling
| Property | Default | Description |
|----------|---------|-------------|
| `border` | `"1px solid #e5e7eb"` | Border style for the launcher button |
| `shadow` | `"0 10px 15px -3px rgba(0,0,0,0.1), ..."` | Box shadow for the launcher button |
| `collapsedMaxWidth` | *(unset)* | CSS `max-width` for the floating launcher pill when the panel is closed; title/subtitle truncate with ellipsis (full text in `title` tooltip). Does not change the open panel width (`width`). |

### Header Icon
| Property | Description |
|----------|-------------|
| `headerIconSize` | Header icon size |
| `headerIconName` | Header icon name |
| `headerIconHidden` | Hide header icon |

## Send Button (`config.sendButton.*`)

| Property | Description |
|----------|-------------|
| `backgroundColor` | Button background |
| `textColor` | Text/icon color |
| `borderWidth` | Border width |
| `borderColor` | Border color |
| `paddingX` / `paddingY` | Padding |
| `iconText` | Emoji/text |
| `iconName` | Icon name |
| `useIcon` | Use icon vs text |
| `size` | Button size |
| `tooltipText` | Tooltip text |
| `showTooltip` | Show tooltip |

## Close Button (`config.launcher.*`)

| Property | Description |
|----------|-------------|
| `closeButtonSize` | Button size |
| `closeButtonColor` | Icon color |
| `closeButtonBackgroundColor` | Background |
| `closeButtonBorderWidth` | Border width |
| `closeButtonBorderColor` | Border color |
| `closeButtonBorderRadius` | Border radius |
| `closeButtonPaddingX` / `closeButtonPaddingY` | Padding |
| `closeButtonPlacement` | `"inline" \| "top-right"` |
| `closeButtonIconName` | Icon name |
| `closeButtonIconText` | Emoji/text |
| `closeButtonTooltipText` | Tooltip text |
| `closeButtonShowTooltip` | Show tooltip |

## Clear Chat Button (`config.launcher.clearChat.*`)

| Property | Description |
|----------|-------------|
| `enabled` | Show clear chat button |
| `placement` | `"inline" \| "top-right"` |
| `iconName` | Icon name |
| `iconColor` | Icon color |
| `backgroundColor` | Background |
| `borderWidth` / `borderColor` / `borderRadius` | Border styling |
| `size` | Button size |
| `paddingX` / `paddingY` | Padding |
| `tooltipText` | Tooltip text |
| `showTooltip` | Show tooltip |

## Voice Recognition (`config.voiceRecognition.*`)

| Property | Description |
|----------|-------------|
| `enabled` | Enable voice input |
| `pauseDuration` | Pause duration (ms) before auto-stop |
| `iconName` / `iconSize` / `iconColor` | Icon styling |
| `backgroundColor` / `borderColor` / `borderWidth` | Button styling |
| `paddingX` / `paddingY` | Padding |
| `tooltipText` / `showTooltip` | Tooltip |
| `recordingIconColor` | Icon color when recording |
| `recordingBackgroundColor` | Background when recording |
| `recordingBorderColor` | Border when recording |
| `showRecordingIndicator` | Show recording indicator |
| `autoResume` | `boolean \| "assistant"` - Auto-resume listening |

## Status Indicator (`config.statusIndicator.*`)

| Property | Default | Description |
|----------|---------|-------------|
| `visible` | `true` | Show status indicator |
| `idleText` | `"Online"` | Idle text |
| `connectingText` | `"Connecting..."` | Connecting text |
| `connectedText` | `"Connected"` | Connected text |
| `errorText` | `"Error"` | Error text |

## Tool Call Display (`config.toolCall.*`)

| Property | Description |
|----------|-------------|
| `backgroundColor` / `borderColor` / `borderWidth` / `borderRadius` | Container styling |
| `headerBackgroundColor` / `headerTextColor` / `headerPaddingX` / `headerPaddingY` | Header styling |
| `contentBackgroundColor` / `contentTextColor` / `contentPaddingX` / `contentPaddingY` | Content styling |
| `codeBlockBackgroundColor` / `codeBlockBorderColor` / `codeBlockTextColor` | Code block styling |
| `toggleTextColor` | Expand/collapse toggle color |
| `labelTextColor` | Label color |

## Message Actions (`config.messageActions.*`)

### Basic Options
| Property | Default | Description |
|----------|---------|-------------|
| `enabled` | `true` | Enable/disable message actions entirely |
| `showCopy` | `true` | Show copy button |
| `showUpvote` | `false` | Show upvote button (requires backend) |
| `showDownvote` | `false` | Show downvote button (requires backend) |

### Appearance
| Property | Default | Description |
|----------|---------|-------------|
| `visibility` | `"hover"` | `"always"` shows buttons always, `"hover"` shows on hover only |
| `align` | `"right"` | Horizontal alignment: `"left"` \| `"center"` \| `"right"` |
| `layout` | `"pill-inside"` | Layout style: `"pill-inside"` \| `"row-inside"` |

### Callbacks
| Property | Description |
|----------|-------------|
| `onFeedback` | Callback when user submits feedback: `(feedback: { type: 'upvote' \| 'downvote', messageId: string }) => void` |
| `onCopy` | Callback when user copies a message: `(message: AgentWidgetMessage) => void` |

## Suggestion Chips (`config.suggestionChipsConfig.*`)

| Property | Description |
|----------|-------------|
| `fontFamily` | `"sans-serif" \| "serif" \| "mono"` |
| `fontWeight` | Font weight |
| `paddingX` / `paddingY` | Padding |

**Chip content:** `config.suggestionChips: string[]`

## Layout (`config.layout.*`)

### Header (`layout.header.*`)
| Property | Description |
|----------|-------------|
| `layout` | `"default" \| "minimal"` |
| `showIcon` / `showTitle` / `showSubtitle` | Show/hide elements |
| `showCloseButton` / `showClearChat` | Show/hide buttons |
| `render` | Custom render function |

### Messages (`layout.messages.*`)
| Property | Description |
|----------|-------------|
| `layout` | `"bubble" \| "flat" \| "minimal"` |
| `groupConsecutive` | Group consecutive same-role messages |
| `avatar.show` / `avatar.position` / `avatar.userAvatar` / `avatar.assistantAvatar` | Avatar config |
| `timestamp.show` / `timestamp.position` / `timestamp.format` | Timestamp config |
| `renderUserMessage` / `renderAssistantMessage` | Custom render functions |

### Slots (`layout.slots.*`)
Available: `header-left`, `header-center`, `header-right`, `body-top`, `messages`, `body-bottom`, `footer-top`, `composer`, `footer-bottom`

## Markdown (`config.markdown.*`)

### Options (`markdown.options.*`)
| Property | Default | Description |
|----------|---------|-------------|
| `gfm` | `true` | Enable GitHub Flavored Markdown |
| `breaks` | `true` | Convert `\n` to `<br>` |
| `pedantic` | `false` | Original markdown.pl behavior |
| `headerIds` | `false` | Add id attributes to headings |
| `headerPrefix` | `""` | Prefix for heading ids |
| `mangle` | `true` | Mangle email addresses |
| `silent` | `false` | Don't throw on parse errors |

### Other Options
| Property | Default | Description |
|----------|---------|-------------|
| `disableDefaultStyles` | `false` | Disable default markdown CSS |
| `renderer` | `undefined` | Custom renderer overrides |

### Override Methods (4 Levels)

**Level 1: CSS Variables** (simplest)

```css
:root {
  /* Headers */
  --persona-md-h1-size: 1.5rem;
  --persona-md-h1-weight: 700;
  --persona-md-h2-size: 1.25rem;
  --persona-md-h3-size: 1.125rem;

  /* Tables */
  --persona-md-table-border-color: #e5e7eb;
  --persona-md-table-header-bg: #f8fafc;
  --persona-md-table-cell-padding: 0.5rem 0.75rem;

  /* Blockquotes */
  --persona-md-blockquote-border-color: var(--persona-accent);
  --persona-md-blockquote-text-color: var(--persona-muted);

  /* Code blocks */
  --persona-md-code-block-bg: var(--persona-container);
  --persona-md-code-block-border-color: var(--persona-border);

  /* Inline code */
  --persona-md-inline-code-bg: var(--persona-container);

  /* Horizontal rules */
  --persona-md-hr-color: var(--persona-divider);
}
```

**Level 2: Markdown Options** (moderate)

```typescript
config: {
  markdown: {
    options: {
      gfm: true,
      breaks: true,
      headerIds: true,
      headerPrefix: 'chat-'
    }
  }
}
```

**Level 3: Custom Renderers** (full control)

```typescript
config: {
  markdown: {
    renderer: {
      heading(token) {
        return `<h${token.depth} class="custom-h${token.depth}">${token.text}</h${token.depth}>`;
      },
      link(token) {
        return `<a href="${token.href}" target="_blank" rel="noopener">${token.text}</a>`;
      }
    }
  }
}
```

Available renderer overrides: `heading`, `code`, `blockquote`, `table`, `link`, `image`, `list`, `listitem`, `paragraph`, `codespan`, `strong`, `em`, `hr`, `br`, `del`, `checkbox`, `html`, `text`

**Level 4: postprocessMessage** (complete override)

```typescript
import { markdownPostprocessor } from '@runtypelabs/persona';

config: {
  postprocessMessage: ({ text }) => markdownPostprocessor(text)
}
```

### Persona theme `components.markdown` (SDK)

These merge into `PersonaTheme` and are exposed as CSS variables on the widget root (`applyThemeVariables`).

| Path | Consumer variable |
|------|-------------------|
| `inlineCode.background` / `foreground` | `--persona-md-inline-code-bg`, `--persona-md-inline-code-color` |
| `link.foreground` | `--persona-md-link-color` (assistant chat markdown links + artifact pane markdown) |
| `heading.h1.fontSize` / `fontWeight` | `--persona-md-h1-size`, `--persona-md-h1-weight` (only when set) |
| `heading.h2.fontSize` / `fontWeight` | `--persona-md-h2-size`, `--persona-md-h2-weight` (only when set) |

### Markdown CSS Variables Reference

```css
:root {
  /* Links (theme-driven via --persona-md-link-color when set) */
  --persona-md-link-color: var(--persona-accent, #0f0f0f);

  /* Headers */
  --persona-md-h1-size: 1.5rem;
  --persona-md-h1-weight: 700;
  --persona-md-h1-margin: 1rem 0 0.5rem;
  --persona-md-h1-line-height: 1.25;
  --persona-md-h2-size: 1.25rem;
  --persona-md-h2-weight: 700;
  --persona-md-h2-margin: 0.875rem 0 0.5rem;
  --persona-md-h2-line-height: 1.3;
  --persona-md-h3-size: 1.125rem;
  --persona-md-h3-weight: 600;
  --persona-md-h3-margin: 0.75rem 0 0.375rem;
  --persona-md-h3-line-height: 1.4;
  --persona-md-h4-size: 1rem;
  --persona-md-h4-weight: 600;
  --persona-md-h5-size: 0.875rem;
  --persona-md-h5-weight: 600;
  --persona-md-h6-size: 0.75rem;
  --persona-md-h6-weight: 600;

  /* Tables */
  --persona-md-table-border-color: var(--persona-border, #e5e7eb);
  --persona-md-table-header-bg: var(--persona-container, #f8fafc);
  --persona-md-table-header-weight: 600;
  --persona-md-table-cell-padding: 0.5rem 0.75rem;
  --persona-md-table-border-radius: 0.375rem;

  /* Horizontal Rule */
  --persona-md-hr-color: var(--persona-divider, #e5e7eb);
  --persona-md-hr-height: 1px;
  --persona-md-hr-margin: 1rem 0;

  /* Blockquotes */
  --persona-md-blockquote-border-color: var(--persona-accent, #0f0f0f);
  --persona-md-blockquote-border-width: 3px;
  --persona-md-blockquote-padding: 0.5rem 1rem;
  --persona-md-blockquote-margin: 0.5rem 0;
  --persona-md-blockquote-bg: transparent;
  --persona-md-blockquote-text-color: var(--persona-muted, #6b7280);
  --persona-md-blockquote-font-style: italic;

  /* Code Blocks */
  --persona-md-code-block-bg: var(--persona-container, #f3f4f6);
  --persona-md-code-block-border-color: var(--persona-border, #e5e7eb);
  --persona-md-code-block-text-color: inherit;
  --persona-md-code-block-padding: 0.75rem;
  --persona-md-code-block-border-radius: 0.375rem;
  --persona-md-code-block-font-size: 0.875rem;

  /* Inline Code */
  --persona-md-inline-code-bg: var(--persona-container, #f3f4f6);
  --persona-md-inline-code-padding: 0.125rem 0.375rem;
  --persona-md-inline-code-border-radius: 0.25rem;
  --persona-md-inline-code-font-size: 0.875em;

  /* Strong/Emphasis */
  --persona-md-strong-weight: 600;
  --persona-md-em-style: italic;
}
```

## Copy / Text (`config.copy.*`)

| Property | Description |
|----------|-------------|
| `welcomeTitle` | Welcome message title |
| `welcomeSubtitle` | Welcome message subtitle |
| `inputPlaceholder` | Input placeholder text |
| `sendButtonLabel` | Send button label |

## Feature Flags (`config.features.*`)

| Property | Description |
|----------|-------------|
| `showReasoning` | Show AI reasoning/thinking steps |
| `showToolCalls` | Show tool call invocations |
| `artifacts` | Artifact sidebar: `enabled`, `allowedTypes`, optional `layout` (split/drawer sizing, launcher widen, resize handle, `paneAppearance`, `toolbarPreset` `default` \| `document`, `documentToolbarShowCopyLabel`, `documentToolbarShowCopyChevron`, `documentToolbarIconColor`, `documentToolbarToggleActiveBackground`, `documentToolbarToggleActiveBorderColor`, borders, `unifiedSplitChrome`, etc.). See README **Features** table for defaults. |

---

## Theme API Exports

```typescript
import {
  // Theme creation
  createTheme,
  resolveTokens,
  themeToCssVariables,
  applyThemeVariables,
  getActiveTheme,
  getColorScheme,
  detectColorScheme,
  createThemeObserver,

  // Plugins
  accessibilityPlugin,
  animationsPlugin,
  brandPlugin,
  reducedMotionPlugin,
  highContrastPlugin,
  createPlugin,
} from '@runtypelabs/persona';
```

---

## Breaking Changes from v1

| Change | v1 | v2 |
|--------|-----|-----|
| CSS variables | `--cw-*` | `--persona-*` |
| Tailwind prefix | `tvw-*` | `persona-*` |
| Theme config | Flat properties | Layered tokens (palette/semantic/components) |
| Dark mode | Separate `darkTheme` object | Unified via `colorScheme` + auto dark palette |
| Host element | `.tvw-widget-root` | `.persona-host` |
