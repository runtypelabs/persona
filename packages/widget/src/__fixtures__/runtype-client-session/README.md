# `runtype-client-session-v1` frame fixtures

One JSON file per frame type (`server/` = server to client, `client/` = client
to server, `http/` = the HTTP shapes that go with the socket). These are copied
byte for byte from the Runtype API's wire fixtures, where the server's schema
validates them; copy them again after the server changes the wire.
`runtype-realtime.test.ts` loads them through `index.ts`.

To test against another copy without replacing these, point
`RUNTYPE_SOCKET_FIXTURES_DIR` at a directory with the same layout; any file it
has replaces the one here.
