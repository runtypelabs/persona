/**
 * Browser APIs the official WebMCP polyfill (`@w3c/webmcp-polyfill`) calls
 * while constructing its context: Chrome/Firefox 126+ and Safari 18+.
 *
 * Upstream does not check for them. Its installer defines the
 * `document.modelContext` getter before it constructs the context, so on an
 * engine missing one of these the install throws and leaves a getter that
 * throws on every read. Check first and install nothing instead.
 *
 * Kept in its own module because both the standalone polyfill chunk and the
 * lazily loaded bridge runtime need it, and neither may import the other.
 */
const isFunction = (owner: object, key: string): boolean =>
  typeof (owner as Record<string, unknown>)[key] === "function";

export const hasWebMcpPolyfillBaseline = (): boolean =>
  isFunction(Promise, "withResolvers") &&
  isFunction(AbortSignal, "any") &&
  isFunction(URL, "parse") &&
  isFunction(String.prototype, "toWellFormed");
