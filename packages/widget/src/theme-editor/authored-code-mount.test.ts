// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { initAgentWidget } from '../runtime/init';
import type { AgentWidgetInitHandle } from '../runtime/init';
import { generateCodeSnippet } from '../utils/code-generators';
import { ThemeEditorState } from './state';

let handle: AgentWidgetInitHandle | undefined;
afterEach(() => { handle?.destroy(); document.body.innerHTML = ''; localStorage.clear(); });

describe('mounting authored generated configuration', () => {
  it.each([false, true])('mounts sparse welcome, brand and send overrides in V5=%s', v5Defaults => {
    document.body.innerHTML = '<div id="authored-fixture"></div>';
    const state = new ThemeEditorState(undefined, {
      apiUrl: '/chat', future: { v5Defaults }, launcher: { enabled: false },
      welcome: { title: 'Authored greeting', subtitle: 'Choose a task' },
      suggestions: { starters: { items: ['Find a product'], placement: 'welcome' } },
      brand: { accent: '#7c3aed' },
    });
    state.set('theme.components.composer.send.foreground', '#fff');
    const code = generateCodeSnippet(state.exportAuthoredConfig().config, 'esm', { authoredOverrides: true, target: '#authored-fixture' });
    const javascript = code.replace(/^import .*;$/gm, '');
    new Function('initAgentWidget', javascript)((options: Parameters<typeof initAgentWidget>[0]) => { handle = initAgentWidget(options); return handle; });
    const mount = document.getElementById('authored-fixture')!;
    expect(mount.textContent).toContain('Authored greeting');
    expect(mount.textContent).toContain('Find a product');
    expect(mount.querySelector('textarea')).not.toBeNull();
    expect(state.exportAuthoredConfig().config).not.toHaveProperty('sendButton.backgroundColor');
  });
});
