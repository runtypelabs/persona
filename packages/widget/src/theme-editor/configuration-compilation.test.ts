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
    const virtualFiles = new Map(fixtures.map((text, index) => [`${packageRoot}src/authoring-fixture-${index}.tsx`, text]));
    const parsedConfig = ts.parseJsonConfigFileContent(
      ts.readConfigFile(`${packageRoot}tsconfig.json`, ts.sys.readFile).config,
      ts.sys, packageRoot,
    );
    const options: ts.CompilerOptions = {
      ...parsedConfig.options, noEmit: true,
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
  });
});
