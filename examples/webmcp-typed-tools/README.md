# Typed checkout tools for Persona

This headless example registers two page tools using native `webmcp-types`
schema inference. It adds no dependency to Persona's published packages and
does not change the bridge, automatic fallback, or approval policy.

The authoring types are pinned to `0.1.9`, matching the v6 fallback's dependency.
The offline checks import Persona's source bridge, which resolves that fallback's
declarations too. Loading different versions of `webmcp-types` in one TypeScript
program duplicates its global type aliases; keep these pins aligned when updating
the fallback. This does not restrict host-installed v5 runtime compatibility.

- `get_cart` reads a cart containing a customer note, marked as untrusted.
- `open_checkout` opens a review screen, never charges or places an order.
  Runtime validation rejects unknown fields, including model-authored consent.

There is intentionally no purchase tool. Your host application owns the final
authenticated checkout and explicit human confirmation. Opening checkout is a
UI mutation, not a read-only operation or a completed purchase.

## Run the offline checks

From the repository root:

```sh
pnpm install
pnpm --filter webmcp-typed-tools test
pnpm --filter webmcp-typed-tools typecheck
pnpm --filter webmcp-typed-tools schema
git diff --exit-code -- examples/webmcp-typed-tools/schema.json
```

The tests execute the registered callbacks and Persona's real bridge runtime
against a controlled registry boundary. They cover malformed input, stale
carts, unsaved work, cancellation, unmount, untrusted-output propagation, and
declined confirmation with string and object schemas. They do not claim to
test a native browser or a model. `types.typecheck.ts` verifies schema-inferred
arguments, including rejection of a nonexistent consent property. Callback
failures include `isError: true` and a `content` text block so Persona preserves
the error classification, alongside the native structured `code` and `error`.

## Connect it to a page

After native WebMCP or your supported page polyfill is ready:

```ts
import { registerCheckoutTools } from './tools';

if (document.modelContext) {
  const cleanup = await registerCheckoutTools(document.modelContext, {
    getCart: () => cartStore.current(),
    hasUnsavedChanges: () => checkoutForm.hasUnsavedChanges(),
    showCheckout: async (cartId, signal) => {
      await router.openCheckout(cartId, { signal });
      await checkoutView.whenRendered();
    },
  });
  // Call cleanup() when this page or component unmounts.
}
```

`cartStore`, `checkoutForm`, `router`, and `checkoutView` are your host adapters,
not Persona APIs. `getCart` returns `{ id, note, totalCents }`. `showCheckout`
must recheck access, respect the signal before side effects, and resolve only
after the review screen renders. Cancellation cannot undo completed effects.
Mount this owner once per page state; cleanup before registering it again.

Enable page tools in your existing Persona embed with
`webmcp: { enabled: true }`. Keep its approval defaults. For Runtype client-token
embeds, also bind the token to the chat surface, enable its WebMCP policy, and
restrict origins and admitted tool names. See [the authoring guide](../../docs/webmcp-authoring.md).

## Run the opt-in model suite

The schema is exported from the same descriptors the example registers.
`evals.json` contains five synthetic cases: inspect the cart, open a known cart,
avoid navigation for ambiguous intent, ignore an instruction in a customer
note, and stop after an unsaved-draft error. The latter two seed prior tool
results; expected calls apply only to the model's continuation.

From this directory, configure a provider key in your shell, then run:

```sh
pnpm dlx webmcp-evals@0.0.4 local -b vercel -m openai:gpt-5 \
  -t schema.json -e evals.json --runs 3 --reporter console json
```

This uses `OPENAI_API_KEY`, sends synthetic prompts to that provider, and may
incur charges. Choose an available model explicitly. The runner is experimental;
the version is pinned for reproducibility. `expectedCall: null` means no new
tool calls are allowed; extra calls fail trajectory matching in this version.
Keep reports in `.evals/` and record the model, version, and run count with results.

The model suite tests tool choice, not the content of a clarification or the
security of a deployed assistant. It does not execute tools or prove browser
approval enforcement. Do not report it as passing unless you ran it. Review
failure reports even if the CLI exits successfully.
