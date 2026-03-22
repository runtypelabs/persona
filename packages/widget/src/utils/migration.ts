import type { AgentWidgetTheme } from '../types';
import type { PersonaTheme } from '../types/theme';

export interface V1ToV2MigrationOptions {
  warn?: boolean;
  colorScheme?: 'light' | 'dark' | 'auto';
}

const v1ToV2Mapping: Record<string, string> = {
  primary: 'palette.colors.primary.500',
  secondary: 'palette.colors.secondary.500',
  accent: 'palette.colors.accent.600',
  surface: 'palette.colors.gray.50',
  muted: 'palette.colors.gray.500',
  container: 'palette.colors.gray.100',
  border: 'palette.colors.gray.200',
  divider: 'palette.colors.gray.200',
  messageBorder: 'palette.colors.gray.200',
  inputBackground: 'palette.colors.gray.50',
  callToAction: 'palette.colors.gray.900',
  callToActionBackground: 'palette.colors.gray.50',
  sendButtonBackgroundColor: 'semantic.colors.primary',
  sendButtonTextColor: 'semantic.colors.textInverse',
  sendButtonBorderColor: 'semantic.colors.primary',
  closeButtonColor: 'palette.colors.gray.500',
  closeButtonBackgroundColor: 'transparent',
  clearChatIconColor: 'palette.colors.gray.500',
  clearChatBackgroundColor: 'transparent',
  micIconColor: 'palette.colors.gray.900',
  micBackgroundColor: 'transparent',
  recordingIconColor: 'palette.colors.white',
  recordingBackgroundColor: 'palette.colors.error.500',
  tooltipBackground: 'palette.colors.gray.900',
  tooltipForeground: 'palette.colors.white',
};

const v1RadiusMapping: Record<string, string> = {
  radiusSm: 'palette.radius.md',
  radiusMd: 'palette.radius.lg',
  radiusLg: 'palette.radius.xl',
  launcherRadius: 'palette.radius.full',
  buttonRadius: 'palette.radius.full',
};

export function migrateV1Theme(
  v1Theme: AgentWidgetTheme | undefined,
  options: V1ToV2MigrationOptions = {}
): Partial<PersonaTheme> {
  if (!v1Theme) {
    return {};
  }

  const migrated: any = {
    palette: {
      colors: {
        primary: {},
        gray: {},
        secondary: {},
        accent: {},
        success: {},
        warning: {},
        error: {},
      },
    },
    semantic: {
      colors: {
        interactive: {},
        feedback: {},
      },
    },
  };

  for (const [key, value] of Object.entries(v1Theme)) {
    if (!value) continue;

    if (key in v1ToV2Mapping) {
      const v2Path = v1ToV2Mapping[key];
      const [category, type, name, shade] = v2Path.split('.');

      if (category === 'palette' && type === 'colors') {
        const colorName = name as keyof typeof migrated.palette.colors;
        if (migrated.palette.colors[colorName]) {
          (migrated.palette.colors[colorName] as any)[shade || '500'] = value;
        }
      } else if (category === 'semantic') {
        const pathParts = v2Path.replace('semantic.colors.', '').split('.');
        if (pathParts.length === 1) {
          migrated.semantic.colors[pathParts[0]] = value;
        } else {
          (migrated.semantic.colors as any)[pathParts[0]] = {
            ...(migrated.semantic.colors as any)[pathParts[0]],
            [pathParts[1]]: value,
          };
        }
      }
    } else if (key in v1RadiusMapping) {
      if (!migrated.palette.radius) {
        migrated.palette.radius = {};
      }
      const radiusKey = key.replace('radius', '').toLowerCase();
      (migrated.palette.radius as any)[radiusKey || 'md'] = value;
    } else if (key === 'inputFontFamily') {
      if (!migrated.palette.typography) {
        migrated.palette.typography = { fontFamily: {} };
      }
      migrated.palette.typography.fontFamily = {
        sans: value === 'sans-serif' ? 'system-ui, sans-serif' : undefined,
        serif: value === 'serif' ? 'Georgia, serif' : undefined,
        mono: value === 'mono' ? 'monospace' : undefined,
      };
    } else if (key === 'inputFontWeight') {
      if (!migrated.palette.typography) {
        migrated.palette.typography = { fontWeight: {} };
      }
      migrated.palette.typography.fontWeight = {
        normal: value,
      };
    } else if (key === 'panelBorder') {
      if (!migrated.components) {
        migrated.components = {};
      }
      if (!migrated.components.panel) {
        migrated.components.panel = {};
      }
      migrated.components.panel.border = value;
    } else if (key === 'panelShadow') {
      if (!migrated.components) {
        migrated.components = {};
      }
      if (!migrated.components.panel) {
        migrated.components.panel = {};
      }
      migrated.components.panel.shadow = value;
    } else if (key === 'panelBorderRadius') {
      if (!migrated.components) {
        migrated.components = {};
      }
      if (!migrated.components.panel) {
        migrated.components.panel = {};
      }
      migrated.components.panel.borderRadius = value;
    }
  }

  if (options.warn !== false) {
    console.warn(
      '[Persona Widget] v1 theme configuration detected. ' +
        'v1 themes are deprecated in v2.0.0. ' +
        'Please migrate to the new semantic token system. ' +
        'See https://persona.sh/docs/v2-migration for guidance.'
    );
  }

  return migrated;
}

export function validateV1Theme(v1Theme: unknown): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const theme = v1Theme as AgentWidgetTheme | undefined;

  if (!theme) {
    return { valid: true, warnings: [] };
  }

  const deprecatedProperties = Object.keys(theme).filter(
    (key) => !(key in v1ToV2Mapping || key in v1RadiusMapping || key === 'inputFontFamily' || key === 'inputFontWeight' || key.startsWith('panel'))
  );

  if (deprecatedProperties.length > 0) {
    warnings.push(
      `The following v1 theme properties have no v2 equivalent and will be ignored: ${deprecatedProperties.join(', ')}`
    );
  }

  return { valid: true, warnings };
}
