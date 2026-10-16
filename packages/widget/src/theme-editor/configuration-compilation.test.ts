import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { generateCodeSnippet } from '../utils/code-generators';

// Use a real TypeScript program against the exported public types. Transpilation
// alone misses widened discriminants and invalid recipe paths.
describe('configuration authoring fixtures', () => {
  it('typechecks guide recipes and ESM/React authored exports against public types', () => {
    const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
    const guide = readFileSync(new URL('../../../../docs/configuration.md', import.meta.url), 'utf8');
    const recipes = [...guide.matchAll(/```typescript\n([\s\S]*?)```/g)].map(match => match[1]);
    const input = {
      apiUrl: '/chat', welcome: { variant: 'none' }, suggestions: { starters: { items: [], placement: 'composer' } },
      brand: { accent: '#7c3aed' }, future: { v5Defaults: true },
      theme: { components: { composer: { send: { foreground: '#fff' } } } },
    };
    const fixtures = [...recipes.map(recipe => `import type { AgentWidgetController } from '@runtypelabs/persona';\ndeclare const widget: AgentWidgetController;\n${recipe}`),
      ...(['esm', 'react-component', 'react-advanced'] as const).map(format => generateCodeSnippet(input, format, { authoredOverrides: true })),
      generateCodeSnippet({ apiUrl: '/chat', messageActions: { showCopy: true } }, 'esm', {
        authoredOverrides: true, hooks: { onCopy: () => {} },
      }),
    ];
    fixtures.push(`
      import type { AgentConfig, AgentWidgetConfigPatch, AgentWidgetWelcomeIcon, VoiceProvider } from '@runtypelabs/persona';
      const agent = { name: 'Support', model: 'model-id', systemPrompt: 'Help customers.' } satisfies AgentConfig;
      const provider = {
        type: 'custom', connect: async () => {}, disconnect: async () => {},
        startListening: async () => {}, stopListening: async () => {},
        onResult: () => {}, onError: () => {}, onStatusChange: () => {},
      } satisfies VoiceProvider;
      const providerFactory: () => VoiceProvider = () => provider;
      const icon = { type: 'image', url: '/logo.png', alt: 'Support' } satisfies AgentWidgetWelcomeIcon;
      const complete: AgentWidgetConfigPatch = { agent, voiceRecognition: { provider: { type: 'custom', custom: providerFactory } }, welcome: { icon } };
      // Preserve existing recursive-patch source compatibility, including sparse replacement objects.
      const compatible: AgentWidgetConfigPatch = { agent: { systemPrompt: 'New prompt' }, voiceRecognition: { provider: { custom: { type: 'custom' } } }, welcome: { icon: { type: 'image' } } };
      // Full field types provide an opt-in completeness check at authoring time.
      // @ts-expect-error A complete agent needs name and model.
      const incompleteAgent = { systemPrompt: 'New prompt' } satisfies AgentConfig;
      // @ts-expect-error A complete provider needs its lifecycle and callback methods.
      const incompleteProvider = { type: 'custom' } satisfies VoiceProvider;
      // @ts-expect-error An image icon needs alt text, including empty alt for decorative images.
      const incompleteIcon = { type: 'image', url: '/logo.png' } satisfies AgentWidgetWelcomeIcon;
      // @ts-expect-error Icon variants cannot carry fields from another variant.
      const hybridIcon = { type: 'text', text: 'Hello', url: '/logo.png' } satisfies AgentWidgetWelcomeIcon;
    `);
    const virtualFiles = new Map(fixtures.map((text, index) => [`${packageRoot}src/authoring-fixture-${index}.tsx`, text]));
    virtualFiles.set(`${packageRoot}src/authoring-styles.d.ts`, 'declare module "@runtypelabs/persona/widget.css";');
    const parsedConfig = ts.parseJsonConfigFileContent(
      ts.readConfigFile(`${packageRoot}tsconfig.json`, ts.sys.readFile).config,
      ts.sys, packageRoot,
    );
    const options: ts.CompilerOptions = {
      ...parsedConfig.options, noEmit: true, rootDir: packageRoot,
      paths: { ...parsedConfig.options.paths, react: ['../../examples/ai-sdk-next/node_modules/@types/react/index.d.ts'] },
    };
    const host = ts.createCompilerHost(options);
    const read = host.readFile.bind(host);
    const exists = host.fileExists.bind(host);
    host.readFile = path => virtualFiles.get(path) ?? read(path);
    host.fileExists = path => virtualFiles.has(path) || exists(path);
    host.getSourceFile = (path, languageVersion) => {
      const source = host.readFile(path);
      return source === undefined ? undefined : ts.createSourceFile(path, source, languageVersion, true);
    };
    const program = ts.createProgram([...virtualFiles.keys(), ...parsedConfig.fileNames.filter(path => path.endsWith('.d.ts'))], options, host);
    const errors = ts.getPreEmitDiagnostics(program).filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
    expect(errors.map(error => `${error.file?.fileName}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`)).toEqual([]);
  }, 30_000);
});
