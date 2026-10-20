# Design and verify WebMCP page tools

Use page tools for browser-only state and UI. Keep backend work in server-side
tools. For hosted Runtype embeds, configure both Persona's `webmcp.enabled` and
the chat surface's WebMCP policy, bind the client token to that surface, and
restrict allowed origins. For other backends, follow
[WebMCP without Runtype](webmcp-without-runtype.md).

## Start with a user journey

1. Write the user's goal and starting state. Include the route, signed-in
   account, selected resource, and any unsaved work.
2. Role-play a successful request, an ambiguous request, and a mid-task failure.
   Identify the point where the assistant must ask or hand control to the user.
3. Define distinct tools with descriptions that say what they do and when to
   select them. Separate opening a review screen from committing an action.
4. Register only tools available in the current state. Use an `AbortController`
   to remove owned registrations when the page or component unmounts.
5. Validate arguments at runtime, recheck resource access, honor cancellation,
   and await visible state updates before returning. Return actionable errors
   for stale selections and unsaved changes.

The [typed checkout example](../examples/webmcp-typed-tools) registers `get_cart`
and `open_checkout`. It cannot purchase anything. The host owns the final
authenticated checkout and its explicit human confirmation.

## Keep hints separate from permission

| Hint | Set it to `true` when |
| --- | --- |
| `readOnlyHint` | The tool changes neither application state nor visible UI. Navigation is not read-only. |
| `consequentialHint` | The tool commits a significant real-world action, such as charging money or sending a message. |
| `untrustedContentHint` | The output contains user-authored or third-party text, even if your database stores it. |

Hints are advisory. A missing or false hint does not establish authorization,
consent, or replay safety. A model-authored `confirmed: true` argument is not
proof that the user approved anything. Treat tool output as data, not as
instructions that can authorize another tool call.

Keep Persona's confirmation defaults. If you configure `webmcp.autoApprove`,
use a host-owned, explicitly reviewed safe-read policy, not arbitrary
page-authored hints. Keep the voice lane's existing policy separate. Neither
browser confirmation nor `requireConfirmFor` replaces server authorization.
On the Runtype client-token path, the server enforces surface enablement and
origin-scoped tool allowlists; token origin restrictions still apply.

## Add authoring types without changing the bridge

The upstream [webmcp-types](https://github.com/webmachinelearning/webmcp-types)
package infers callback input from a literal JSON Schema. Add it only to the
app authoring the tools and activate it in that app's TypeScript configuration.
It is different from `@mcp-b/webmcp-types`. Neither declarations nor inference
validate runtime input or install WebMCP in a browser.

Keep Persona's structural consumer types, v5 fallback, and multi-generation
bridge intact. Do not replace them with native-only assumptions. A page can
use native support or install its own supported polyfill before registration;
do not replace an existing `document.modelContext`. Verify declaration builds
and browser/polyfill behavior before changing any compatibility contract.

## Test execution and model behavior separately

Run deterministic tests for malformed input, stale resources, approval denial,
cancellation, unmount, and UI synchronization. A denied action must have no
side effect. Test both old string and current object schema representations
when exercising Persona's bridge.

Then run model evaluations for tool selection and argument extraction. Include
ambiguity, injected instructions in tool results, and recovery after a failed
step. Use synthetic data and keep provider credentials outside the browser.
Record the model, runner version, run count, and failures. The typed example
contains a pinned, opt-in runner command and five model cases.

Schema-only evaluations do not execute Persona, enforce approval, verify the
final UI, or prove prompt-injection safety. Inspect tools across relevant
routes and states in native Chrome and Persona's supported polyfill paths.
Keep existing browser checks alongside model evaluations.

Google's [WebMCP authoring skill](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/webmcp-skills)
provides journey design and role-play workflows. Apply it alongside these
security and compatibility rules. Its authoring budgets and tool-consolidation
preferences do not create new Persona or Runtype platform limits. It is a
coding-assistant skill, not a deployed Runtype Agent Skill bundle.
