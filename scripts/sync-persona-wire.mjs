import { access, readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const checkOnly = process.argv.includes("--check");

const groups = [
  {
    source: "packages/persona-wire/src/index.ts",
    destinations: [
      "examples/echo-express/src/lib/persona-wire.ts",
      "examples/echo-hono/src/lib/persona-wire.ts",
      "examples/echo-script-tag/src/lib/persona-wire.ts",
      "examples/echo-sveltekit/src/lib/persona-wire.ts",
      "examples/eve-next/app/lib/persona-wire.ts",
      "examples/langgraph-next/app/lib/persona-wire.ts",
      "examples/openai-agents-next/app/lib/persona-wire.ts",
    ],
  },
  {
    source: "packages/persona-wire/src/testing.ts",
    destinations: [
      "examples/echo-express/tests/wire-testing.ts",
      "examples/echo-hono/tests/wire-testing.ts",
      "examples/echo-script-tag/tests/wire-testing.ts",
      "examples/echo-sveltekit/tests/wire-testing.ts",
      "examples/eve-next/tests/wire-testing.ts",
      "examples/langgraph-next/tests/wire-testing.ts",
      "examples/openai-agents-next/tests/wire-testing.ts",
    ],
  },
];

const specializedRuntimeCopies = [
  {
    path: "examples/ai-sdk-next/app/lib/persona-wire.ts",
    reason: "owns AI SDK/OpenAI message mappings and terminal lifecycle",
  },
];

const stale = [];
let destinationCount = 0;

for (const group of groups) {
  const source = await readFile(new URL(group.source, root));
  for (const destination of group.destinations) {
    destinationCount += 1;
    const destinationUrl = new URL(destination, root);
    if (checkOnly) {
      const current = await readFile(destinationUrl);
      if (!source.equals(current)) stale.push(destination);
    } else {
      await writeFile(destinationUrl, source);
    }
  }
}

for (const specialized of specializedRuntimeCopies) {
  await access(new URL(specialized.path, root));
  console.log(`Skipped intentional specialization: ${specialized.path} (${specialized.reason}).`);
}

if (!checkOnly) {
  console.log(`Updated ${destinationCount} vendored Persona wire helper files.`);
} else if (stale.length > 0) {
  console.error("Vendored Persona wire helpers are stale:");
  for (const destination of stale) console.error(`- ${destination}`);
  console.error("Run pnpm sync:persona-wire to update vendored copies.");
  process.exitCode = 1;
} else {
  console.log(`All ${destinationCount} vendored Persona wire helper files are in sync.`);
}
