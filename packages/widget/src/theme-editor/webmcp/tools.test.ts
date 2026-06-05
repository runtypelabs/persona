import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeEditorState } from '../state';
import { createThemeEditorTools } from './tools';
import type { WebMcpTool } from './types';

function toolMap(state: ThemeEditorState, opts?: Parameters<typeof createThemeEditorTools>[1]) {
  const tools = createThemeEditorTools(state, opts);
  const map = new Map<string, WebMcpTool>();
  for (const t of tools) map.set(t.name, t);
  return map;
}

async function call(tool: WebMcpTool, input: unknown): Promise<any> {
  const res = await tool.execute(input);
  return res.structuredContent;
}

describe('createThemeEditorTools', () => {
  let state: ThemeEditorState;
  let tools: Map<string, WebMcpTool>;

  beforeEach(() => {
    state = new ThemeEditorState();
    tools = toolMap(state);
  });

  it('exposes the expected catalog', () => {
    expect([...tools.keys()].sort()).toEqual(
      [
        'apply_preset',
        'assign_color_role',
        'check_contrast',
        'configure_widget',
        'get_theme_overview',
        'manage_session',
        'set_brand_colors',
        'set_color_scheme',
        'set_copy_and_suggestions',
        'set_roundness',
        'set_theme_fields',
        'set_typography',
      ].sort()
    );
  });

  it('get_theme_overview returns summary + presets and is read-only', async () => {
    const overview = tools.get('get_theme_overview')!;
    expect(overview.annotations?.readOnlyHint).toBe(true);
    const out = await call(overview, {});
    expect(out.summary.brand.primary).toMatch(/^#/);
    expect(out.presets.map((p: any) => p.id)).toContain('default-dark');
    expect(out.availableRoles.some((r: any) => r.role === 'header')).toBe(true);
  });

  it('set_brand_colors generates a full scale and applies to light + dark', async () => {
    const out = await call(tools.get('set_brand_colors')!, { primary: 'blue' });
    expect(out.ok).toBe(true);
    expect(out.applied.primary).toBe('#0000ff');
    // Whole scale written, not just 500.
    expect(state.get('theme.palette.colors.primary.50')).toMatch(/^#/);
    expect(state.get('theme.palette.colors.primary.700')).toMatch(/^#/);
    expect(state.get('darkTheme.palette.colors.primary.500')).toMatch(/^#/);
  });

  it('set_brand_colors accepts rgb() input without corrupting the scale', async () => {
    const out = await call(tools.get('set_brand_colors')!, { primary: 'rgb(37, 99, 235)' });
    expect(out.ok).toBe(true);
    for (const shade of ['50', '500', '700', '950']) {
      expect(state.get(`theme.palette.colors.primary.${shade}`)).toMatch(/^#[0-9a-f]{6}$/);
      expect(state.get(`darkTheme.palette.colors.primary.${shade}`)).not.toContain('NaN');
    }
  });

  it('assign_color_role writes role tokens to both variants', async () => {
    const out = await call(tools.get('assign_color_role')!, {
      role: 'header',
      family: 'primary',
      intensity: 'solid',
    });
    expect(out.applied.role).toBe('header');
    expect(out.applied.tokensWritten).toBeGreaterThan(0);
    expect(state.get('theme.components.header.background')).toBe('palette.colors.primary.500');
    expect(state.get('darkTheme.components.header.background')).toBe('palette.colors.primary.500');
  });

  it('coerces neutral family alias', async () => {
    await call(tools.get('assign_color_role')!, { role: 'borders', family: 'gray' });
    expect(state.get('theme.semantic.colors.border')).toBe('palette.colors.gray.600');
  });

  it('set_typography maps keywords to token refs', async () => {
    await call(tools.get('set_typography')!, { fontFamily: 'serif', fontWeight: 600 });
    expect(state.get('theme.semantic.typography.fontFamily')).toBe(
      'palette.typography.fontFamily.serif'
    );
    expect(state.get('theme.semantic.typography.fontWeight')).toBe(
      'palette.typography.fontWeight.semibold'
    );
  });

  it('set_roundness applies a keyword preset', async () => {
    await call(tools.get('set_roundness')!, { style: 'pill' });
    expect(state.get('theme.palette.radius.md')).toBe('9999px');
    const out = await call(tools.get('get_theme_overview')!, {});
    expect(out.summary.roundness.style).toBe('pill');
  });

  it('set_color_scheme sets scheme and editTarget scopes later writes', async () => {
    await call(tools.get('set_color_scheme')!, { scheme: 'dark', editTarget: 'light' });
    expect(state.get('colorScheme')).toBe('dark');
    // editTarget=light → brand write should not touch darkTheme.
    const before = state.get('darkTheme.palette.colors.accent.500');
    await call(tools.get('set_brand_colors')!, { accent: 'red' });
    expect(state.get('theme.palette.colors.accent.500')).toBe('#ff0000');
    expect(state.get('darkTheme.palette.colors.accent.500')).toBe(before);
  });

  it('apply_preset validates id and applies', async () => {
    const out = await call(tools.get('apply_preset')!, { presetId: 'default-dark' });
    expect(out.applied.appliedPreset.id).toBe('default-dark');
    expect(() => tools.get('apply_preset')!.execute({ presetId: 'nope' })).toThrow(
      /Valid presets/
    );
  });

  it('configure_widget writes config paths', async () => {
    await call(tools.get('configure_widget')!, {
      launcherPosition: 'bottom-left',
      features: { voice: true, attachments: true },
      layout: { avatars: true, messageStyle: 'flat' },
    });
    expect(state.get('launcher.position')).toBe('bottom-left');
    expect(state.get('voiceRecognition.enabled')).toBe(true);
    expect(state.get('attachments.enabled')).toBe(true);
    expect(state.get('layout.messages.avatar.show')).toBe(true);
    expect(state.get('layout.messages.layout')).toBe('flat');
  });

  it('set_copy_and_suggestions sets copy + chips', async () => {
    await call(tools.get('set_copy_and_suggestions')!, {
      title: 'Hi there',
      suggestions: ['a', 'b'],
    });
    expect(state.get('copy.welcomeTitle')).toBe('Hi there');
    expect(state.get('suggestionChips')).toEqual(['a', 'b']);
  });

  it('set_theme_fields resolves field ids and reports per-update status', async () => {
    const out = await call(tools.get('set_theme_fields')!, {
      updates: [
        { field: 'launch-enabled', value: false },
        { field: 'theme.palette.radius.md', value: '20px' },
        { field: 'totally-unknown', value: 'x' },
      ],
    });
    expect(state.get('launcher.enabled')).toBe(false);
    expect(state.get('theme.palette.radius.md')).toBe('20px');
    const reports = out.applied.updates;
    expect(reports.find((r: any) => r.field === 'launch-enabled').ok).toBe(true);
    expect(reports.find((r: any) => r.field === 'totally-unknown').ok).toBe(false);
  });

  it('set_theme_fields field-ids honor the edit target (both → light + dark)', async () => {
    await call(tools.get('set_theme_fields')!, {
      updates: [{ field: 'brand-primary', value: '#123456' }],
    });
    // 'brand-primary' resolves to theme.palette.colors.primary.500; default
    // editTarget is 'both', so it must scope to dark as well.
    expect(state.get('theme.palette.colors.primary.500')).toBe('#123456');
    expect(state.get('darkTheme.palette.colors.primary.500')).toBe('#123456');
  });

  it('assign_color_role on input is covered by contrast checks (no silent no-op)', async () => {
    // ROLE_INPUT used to map to no contrast pairs; derived keys now include it.
    const out = await call(tools.get('assign_color_role')!, {
      role: 'input',
      family: 'primary',
      intensity: 'soft',
    });
    expect(out.applied.role).toBe('input');
    expect(Array.isArray(out.warnings)).toBe(true);
  });

  it('check_contrast returns checks and is read-only', async () => {
    const tool = tools.get('check_contrast')!;
    expect(tool.annotations?.readOnlyHint).toBe(true);
    const out = await call(tool, { level: 'AA', variant: 'light' });
    expect(out.total).toBeGreaterThan(0);
    expect(Array.isArray(out.checks)).toBe(true);
  });

  it('manage_session undo reverts the last change', async () => {
    await call(tools.get('set_brand_colors')!, { primary: 'red' });
    expect(state.get('theme.palette.colors.primary.500')).toBe('#ff0000');
    const out = await call(tools.get('manage_session')!, { action: 'undo' });
    expect(out.ok).toBe(true);
    expect(state.get('theme.palette.colors.primary.500')).not.toBe('#ff0000');
  });

  it('manage_session export returns a snapshot', async () => {
    const out = await call(tools.get('manage_session')!, { action: 'export' });
    expect(out.snapshot.version).toBe(2);
    expect(out.snapshot.theme).toBeDefined();
  });
});
