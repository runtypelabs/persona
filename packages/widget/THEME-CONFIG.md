# Widget Theme & Configuration Reference

This document provides definitions of all themable configuration options.

## Dark Mode Support

The widget supports automatic dark mode detection and theme switching.

### Configuration Options

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `theme` | `AgentWidgetTheme` | (light colors) | Theme colors for light mode |
| `darkTheme` | `AgentWidgetTheme` | (dark colors) | Theme colors for dark mode |
| `colorScheme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Color scheme mode |

### Color Scheme Modes

- **`'light'`** (default): Always use `theme` colors
- **`'dark'`**: Always use `darkTheme` colors (falls back to `theme` if not provided)
- **`'auto'`**: Automatically detect and switch based on page settings

### Auto Detection Order

When `colorScheme: 'auto'`, the widget detects dark mode by:
1. Checking if `<html>` element has `dark` class (e.g., `<html class="dark">`)
2. Falling back to `prefers-color-scheme: dark` media query

The widget automatically updates when:
- The `dark` class is added/removed from `<html>`
- System color scheme preference changes

### Usage Examples

**Basic dark mode with auto-detection:**

```typescript
initAgentWidget({
  target: '#chat',
  config: {
    colorScheme: 'auto',
    theme: {
      primary: '#111827',
      surface: '#ffffff',
      container: '#f8fafc',
    },
    darkTheme: {
      primary: '#f9fafb',
      surface: '#1f2937',
      container: '#111827',
    }
  }
});
```

**Force dark mode:**

```typescript
initAgentWidget({
  target: '#chat',
  config: {
    colorScheme: 'dark',
    darkTheme: {
      primary: '#f9fafb',
      surface: '#1f2937',
      accent: '#3b82f6',
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

### Default Dark Theme

When using `colorScheme: 'auto'` or `colorScheme: 'dark'` without providing a `darkTheme`, the widget uses these default dark colors:

| Property | Value |
|----------|-------|
| `primary` | `#f9fafb` |
| `accent` | `#3b82f6` |
| `surface` | `#1f2937` |
| `muted` | `#9ca3af` |
| `container` | `#111827` |
| `border` | `#374151` |
| `divider` | `#374151` |
| `inputBackground` | `#111827` |

---

## Theme Colors (`config.theme.*`)

| Property | Description |
|----------|-------------|
| `primary` | Main text color for headings, body text, and icons |
| `secondary` | Secondary text color for less prominent text |
| `surface` | Background for panel, input area, and assistant message bubbles |
| `muted` | Muted text color for timestamps, hints |
| `accent` | User message bubbles and interactive elements |
| `container` | Message container/body area background |
| `border` | Default border color for panel and elements |
| `divider` | Color for divider lines between sections |
| `messageBorder` | Border color for message bubbles |
| `inputBackground` | Background for the text input/composer |
| `callToAction` | Launcher call-to-action icon color |
| `callToActionBackground` | Launcher call-to-action button background |

## Panel Styling (`config.theme.*`)

| Property | Default | Description |
|----------|---------|-------------|
| `panelBorder` | `"1px solid var(--tvw-cw-border)"` | Border style for the chat panel |
| `panelShadow` | `"0 25px 50px -12px rgba(0,0,0,0.25)"` | Box shadow for the panel |
| `panelBorderRadius` | `"16px"` | Border radius for panel corners |

## Border Radius (`config.theme.*`)

| Property | Description |
|----------|-------------|
| `radiusSm` | Small radius (chips, small elements) |
| `radiusMd` | Medium radius (buttons, inputs) |
| `radiusLg` | Large radius (cards, panels) |
| `launcherRadius` | Launcher button radius |
| `buttonRadius` | Button radius |

## Typography (`config.theme.*`)

| Property | Description |
|----------|-------------|
| `inputFontFamily` | `"sans-serif" \| "serif" \| "mono"` - Input font family |
| `inputFontWeight` | Input font weight |

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

### Full Height & Sidebar
| Property | Default | Description |
|----------|---------|-------------|
| `fullHeight` | `false` | Fill full height of container |
| `sidebarMode` | `false` | Position as sidebar flush with viewport |
| `sidebarWidth` | `"420px"` | Sidebar width |
| `heightOffset` | `0` | Pixel offset to subtract from calculated panel height |

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
| `shadow` | `"0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)"` | Box shadow for the launcher button |

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

**Theme overrides:** `sendButtonBackgroundColor`, `sendButtonTextColor`, `sendButtonBorderColor`

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

**Theme overrides:** `closeButtonColor`, `closeButtonBackgroundColor`, `closeButtonBorderColor`

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

**Theme overrides:** `clearChatIconColor`, `clearChatBackgroundColor`, `clearChatBorderColor`

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

**Theme overrides:** `micIconColor`, `micBackgroundColor`, `micBorderColor`, `recordingIconColor`, `recordingBackgroundColor`, `recordingBorderColor`

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

Action buttons (copy, upvote, downvote) that appear on assistant messages.

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
| `layout` | `"pill-inside"` | Layout style: `"pill-inside"` (compact floating pill) \| `"row-inside"` (full-width row) |

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
| `layout` | `"default" \| "minimal" \| "expanded"` |
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

The widget supports markdown rendering with multiple levels of customization.

### Options (`markdown.options.*`)
| Property | Default | Description |
|----------|---------|-------------|
| `gfm` | `true` | Enable GitHub Flavored Markdown (tables, strikethrough) |
| `breaks` | `true` | Convert `\n` in paragraphs into `<br>` |
| `pedantic` | `false` | Conform to original markdown.pl behavior |
| `headerIds` | `false` | Add id attributes to headings |
| `headerPrefix` | `""` | Prefix for heading id attributes |
| `mangle` | `true` | Mangle email addresses for spam protection |
| `silent` | `false` | Silent mode - don't throw on parse errors |

### Other Options
| Property | Default | Description |
|----------|---------|-------------|
| `disableDefaultStyles` | `false` | Disable default markdown CSS styles |
| `renderer` | `undefined` | Custom renderer overrides (see examples below) |

### Override Methods (4 Levels)

**Level 1: CSS Variables** (simplest)

Override markdown element styles via CSS custom properties:

```css
:root {
  /* Headers */
  --cw-md-h1-size: 1.5rem;
  --cw-md-h1-weight: 700;
  --cw-md-h2-size: 1.25rem;
  --cw-md-h3-size: 1.125rem;
  
  /* Tables */
  --cw-md-table-border-color: #e5e7eb;
  --cw-md-table-header-bg: #f8fafc;
  --cw-md-table-cell-padding: 0.5rem 0.75rem;
  
  /* Blockquotes */
  --cw-md-blockquote-border-color: #3b82f6;
  --cw-md-blockquote-text-color: #6b7280;
  
  /* Code blocks */
  --cw-md-code-block-bg: #1f2937;  /* Dark background for dark themes */
  --cw-md-code-block-border-color: #374151;
  
  /* Inline code */
  --cw-md-inline-code-bg: #1f2937;
  
  /* Horizontal rules */
  --cw-md-hr-color: #e5e7eb;
}
```

> **Dark Theme Support:** Code blocks, inline code, tables, blockquotes, and horizontal rules automatically inherit from theme colors (`--cw-container`, `--cw-border`, `--cw-divider`, `--cw-accent`, `--cw-muted`). When you configure a dark theme via `config.theme`, these markdown elements adapt automatically.

**Level 2: Markdown Options** (moderate)

Configure markdown parsing behavior via config:

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

Override rendering of specific elements:

```typescript
config: {
  markdown: {
    renderer: {
      // Custom heading renderer
      heading(token) {
        return `<h${token.depth} class="custom-h${token.depth}">${token.text}</h${token.depth}>`;
      },
      // Open links in new tab
      link(token) {
        return `<a href="${token.href}" target="_blank" rel="noopener">${token.text}</a>`;
      },
      // Wrap tables in scrollable container
      table(token) {
        // Return false to use default renderer
        return false;
      }
    }
  }
}
```

Available renderer overrides: `heading`, `code`, `blockquote`, `table`, `link`, `image`, `list`, `listitem`, `paragraph`, `codespan`, `strong`, `em`, `hr`, `br`, `del`, `checkbox`, `html`, `text`

**Level 4: postprocessMessage** (complete override)

Full control over message transformation:

```typescript
import { markdownPostprocessor, createMarkdownProcessorFromConfig } from '@runtypelabs/persona';

config: {
  // Option A: Use built-in markdown processor
  postprocessMessage: ({ text }) => markdownPostprocessor(text),
  
  // Option B: Create custom processor with config
  postprocessMessage: ({ text }) => {
    const processor = createMarkdownProcessorFromConfig({
      options: { gfm: true },
      renderer: {
        link(token) {
          return `<a href="${token.href}" class="custom-link">${token.text}</a>`;
        }
      }
    });
    return processor(text);
  },
  
  // Option C: Use any markdown library
  postprocessMessage: ({ text }) => myCustomMarkdownRenderer(text)
}
```

### CSS Variables Reference

```css
:root {
  /* Headers */
  --cw-md-h1-size: 1.5rem;
  --cw-md-h1-weight: 700;
  --cw-md-h1-margin: 1rem 0 0.5rem;
  --cw-md-h1-line-height: 1.25;
  --cw-md-h2-size: 1.25rem;
  --cw-md-h2-weight: 700;
  --cw-md-h2-margin: 0.875rem 0 0.5rem;
  --cw-md-h2-line-height: 1.3;
  --cw-md-h3-size: 1.125rem;
  --cw-md-h3-weight: 600;
  --cw-md-h3-margin: 0.75rem 0 0.375rem;
  --cw-md-h3-line-height: 1.4;
  --cw-md-h4-size: 1rem;
  --cw-md-h4-weight: 600;
  --cw-md-h4-margin: 0.625rem 0 0.25rem;
  --cw-md-h4-line-height: 1.5;
  --cw-md-h5-size: 0.875rem;
  --cw-md-h5-weight: 600;
  --cw-md-h5-margin: 0.5rem 0 0.25rem;
  --cw-md-h5-line-height: 1.5;
  --cw-md-h6-size: 0.75rem;
  --cw-md-h6-weight: 600;
  --cw-md-h6-margin: 0.5rem 0 0.25rem;
  --cw-md-h6-line-height: 1.5;

  /* Tables */
  --cw-md-table-border-color: var(--cw-border, #e5e7eb);
  --cw-md-table-header-bg: var(--cw-container, #f8fafc);
  --cw-md-table-header-weight: 600;
  --cw-md-table-cell-padding: 0.5rem 0.75rem;
  --cw-md-table-border-radius: 0.375rem;

  /* Horizontal Rule */
  --cw-md-hr-color: var(--cw-divider, #e5e7eb);
  --cw-md-hr-height: 1px;
  --cw-md-hr-margin: 1rem 0;

  /* Blockquotes */
  --cw-md-blockquote-border-color: var(--cw-accent, #3b82f6);
  --cw-md-blockquote-border-width: 3px;
  --cw-md-blockquote-padding: 0.5rem 1rem;
  --cw-md-blockquote-margin: 0.5rem 0;
  --cw-md-blockquote-bg: transparent;
  --cw-md-blockquote-text-color: var(--cw-muted, #6b7280);
  --cw-md-blockquote-font-style: italic;

  /* Code Blocks (fenced code) - inherits from --cw-container */
  --cw-md-code-block-bg: #f3f4f6;           /* auto: var(--cw-container) */
  --cw-md-code-block-border-color: #e5e7eb; /* auto: var(--cw-border) */
  --cw-md-code-block-text-color: inherit;
  --cw-md-code-block-padding: 0.75rem;
  --cw-md-code-block-border-radius: 0.375rem;
  --cw-md-code-block-font-size: 0.875rem;

  /* Inline Code - inherits from --cw-container */
  --cw-md-inline-code-bg: #f3f4f6;          /* auto: var(--cw-container) */
  --cw-md-inline-code-padding: 0.125rem 0.375rem;
  --cw-md-inline-code-border-radius: 0.25rem;
  --cw-md-inline-code-font-size: 0.875em;

  /* Strong/Emphasis */
  --cw-md-strong-weight: 600;
  --cw-md-em-style: italic;
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

## CSS Variables

```css
:root {
  --tvw-cw-primary: #1f2937;
  --tvw-cw-secondary: #6b7280;
  --tvw-cw-surface: #ffffff;
  --tvw-cw-muted: #9ca3af;
  --tvw-cw-accent: #3b82f6;
  --tvw-cw-container: #f8fafc;
  --tvw-cw-border: #e5e7eb;
  --tvw-cw-divider: #e5e7eb;
  --tvw-cw-message-border: #e5e7eb;
  --tvw-cw-input-background: #ffffff;
  --tvw-cw-call-to-action: #ffffff;
  --tvw-cw-call-to-action-background: #1f2937;
}
```

