/**
 * `@runtypelabs/persona/websocket-transport`: the lazy WebSocket transport
 * chunk. Hosts import `createWebSocketTransport` from here (npm) or obtain it
 * with `loadWebSocketTransport()` (any build, including the CDN bundle). The
 * widget itself loads this chunk only when a Runtype session advertises the
 * client-session socket, or at mount when `realtime.connect` is not `'focus'`.
 */
export * from "./websocket-transport-core";
export {
  createRuntypeCodec,
  createRuntypeRealtimeController,
  createRuntypeRealtimeTransport,
  runtypeRealtimeUrl,
  RUNTYPE_BEARER_SUBPROTOCOL,
  RUNTYPE_CLIENT_SESSION_PROTOCOL,
} from "./runtype-realtime";
export { installRealtimeConnect } from "./realtime-connect";
export type {
  RuntypeRealtimeAdvertisement,
  RuntypeRealtimeClient,
  RuntypeRealtimeController,
  RuntypeRealtimeHandlers,
  RuntypeRealtimeHost,
  RuntypeRealtimeTransport,
} from "./runtype-realtime";
