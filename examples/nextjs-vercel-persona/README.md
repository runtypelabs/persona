# Next.js Persona Demo

This example is a deliberately small product demo for embedding Persona into a
normal Next.js App Router application.

It proves four things:

1. Persona can navigate between routes without losing chat state.
2. Persona can call allowlisted local tools to fill a form.
3. Persona can require built-in approval for a sensitive tool call.
4. Persona can be themed to match a shadcn-style host app.

## Routes

The demo has only two routes:

- `/` shows the feature overview and the exact source data Persona should read.
- `/demo-form` shows the compact form Persona can fill and submit.

## Local tool contract

The model only has four typed client actions:

- `message`
- `navigate_to_route`
- `prefill_form`
- `submit_form`

Guardrails are local and explicit:

- `navigate_to_route` only accepts the route IDs `home` and `demo_form`.
- `prefill_form` only accepts the six allowlisted field IDs in the form registry.
- `prefill_form` rejects attempts to patch `securityApproved` or `finalApprover`.
- `submit_form` is only available on `/demo-form`.
- `submit_form` always pauses on Persona&apos;s built-in approval UI before local state changes.
- No raw URLs, selectors, arbitrary JavaScript, or generic browser automation are exposed.

## Demo flow

1. Open `/`.
2. Ask Persona to open the demo form.
3. Ask Persona to fill the form from the visible source data.
4. Ask Persona to submit the form.
5. Approve or deny the built-in approval prompt and watch the local page state update or stay unchanged.

## Local setup

From the repo root:

```bash
pnpm install
pnpm --filter nextjs-vercel-persona dev
```

Then open [http://localhost:3000](http://localhost:3000).

If backend credentials are missing, the app still renders the docked assistant
chrome and shows a visible setup banner explaining what is missing.

## Backend selection

The example uses a single route handler at `app/api/chat/dispatch/route.ts` and
supports two backends.

### Option 1: Vercel AI Gateway

Set either:

```bash
AI_GATEWAY_API_KEY=...
```

or:

```bash
VERCEL_OIDC_TOKEN=...
```

Optional:

```bash
PERSONA_MODEL=openai/gpt-5.4
```

### Option 2: Runtype

```bash
RUNTYPE_API_KEY=...
```

Optional:

```bash
PERSONA_MODEL=mercury-2
```

The Runtype path uses a virtual flow defined in code so the example does not
depend on a separately managed flow.

### Environment precedence

Backend selection follows this exact order:

1. `PERSONA_BACKEND`
2. `AI_GATEWAY_API_KEY`
3. `VERCEL_OIDC_TOKEN`
4. `RUNTYPE_API_KEY`

Rules:

- `PERSONA_BACKEND=ai-gateway` requires `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`.
- `PERSONA_BACKEND=runtype` requires `RUNTYPE_API_KEY`.
- If `PERSONA_BACKEND` is unset, the example auto-detects the first matching credential source in the order above.

## Architecture notes

- `components/persona-chat.tsx` mounts Persona once in the shared layout, keeps
  chat in local storage, provides route-aware context, and runs the local tools.
- `lib/app-state.tsx` holds the shared form state and exposes the typed bridge
  used by the widget.
- `lib/implementation-form.ts` is the source of truth for field definitions,
  validators, allowlisted writes, and submit readiness.
- `lib/chat/action-contract.ts` defines the structured local action schema and
  the capability manifest.
- `lib/persona-theme.ts` themes the widget to match the host app without
  changing the host app tokens.

## Verification

Run the focused checks for this example:

```bash
pnpm --filter nextjs-vercel-persona lint
pnpm --filter nextjs-vercel-persona test
pnpm --filter nextjs-vercel-persona build
```

Manual checks worth doing in the browser:

- Ask Persona on `/` to open `/demo-form` and confirm the transcript survives the route change.
- Ask Persona to fill the form and confirm only the six allowlisted fields change.
- Ask Persona to change `securityApproved` or `finalApprover` and confirm the patch is rejected locally.
- Ask Persona to submit the form and confirm the inline approval UI appears.
- Approve submit and confirm the form enters the submitted state.
- Deny submit and confirm the form stays unchanged.
- Refresh the page and confirm the conversation is restored from local storage.
