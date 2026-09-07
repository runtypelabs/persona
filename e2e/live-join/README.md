# Real Core live-join browser test

This suite uses the built widget and a real isolated Core Wrangler/PGlite stack,
with the local mock model gateway and test MCP server. It never embeds an API key
in the browser, and provisions only synthetic test content.

1. Start Core with real Durable Object bindings, PGlite, the mock model gateway,
   and `apps/test-mcp-server`. Use unused ports (the validated run used API 8887,
   model gateway 8798, and test MCP 8788).
2. From Core, provision a fixture with the exported
   `.github/smoke-tests/lib/client-join-fixture.ts` helper:
   `createClientJoinFixture(apiUrl, apiKey, 'http://127.0.0.1:4318')`.
   Set `TEST_MCP_SERVER_URL` to the local MCP `/mcp` endpoint first. Write its
   returned object to a temporary JSON file outside either repository.
3. In Persona, run:

   ```sh
   pnpm build:widget
   PERSONA_JOIN_FIXTURE=/absolute/path/to/fixture.json \
     pnpm exec playwright test --config e2e/live-join/playwright.config.ts
   ```

4. In a `finally` block, delete the fixture's synthetic conversation records and
   call `cleanupClientJoinFixture(fixture, apiKey)`. Delete the temporary JSON
   file. Do not commit its public client token or visitor credentials.

The tests use actual textarea submissions, real visitor authorization, an
8-second MCP tool, durable receipt polling, explicit cancellation, lost HTTP
acknowledgements, an awaiting client question, and reload/reconnect. The narrow
Stop test covers a 390px viewport. Screenshots and failing traces are written to
the ignored Playwright results directory.

The Core `client-session-join` registered smoke independently exercises API
admission, idempotency conflicts, receipt privacy, and persisted history. Both
suites should pass before publishing changes to the join contract.
