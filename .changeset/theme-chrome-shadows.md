---
"@runtypelabs/persona": minor
---

Expose theme-controlled box shadows for message bubbles, tool and reasoning rows, and the composer.

- **`AgentWidgetTheme`:** optional `messageUserShadow`, `messageAssistantShadow`, `toolBubbleShadow`, `reasoningBubbleShadow`, and `composerShadow` map into the token pipeline and consumer CSS variables (`--persona-message-user-shadow`, `--persona-message-assistant-shadow`, `--persona-tool-bubble-shadow`, `--persona-reasoning-bubble-shadow`, `--persona-composer-shadow`).
- **Semantic tokens:** `ComponentTokens` gains `message.user.shadow`, `toolBubble`, `reasoningBubble`, and `composer` with defaults in `DEFAULT_COMPONENTS`; `themeToCssVariables` wires them to the variables above.
- **CSS:** bubble and composer rules read those variables so shadow styling stays overridable from theme/config.
- **V1 migration:** flat `messageUserShadow` / `messageAssistantShadow` / `toolBubbleShadow` / `reasoningBubbleShadow` / `composerShadow` keys migrate into v2 `components`; `validateV1Theme` no longer flags them as unknown deprecated properties.
- **`toolCall.shadow`:** when set on `AgentWidgetConfig`, `applyThemeVariables` overrides `--persona-tool-bubble-shadow` on the root element.
