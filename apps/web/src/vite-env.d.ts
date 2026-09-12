/// <reference types="vite/client" />

// Versioned mount path of the embedded jspaint (`/jspaint-<hash>`), injected
// by `define` in vite.config.ts. See serveJsPaint there.
declare const __JSPAINT_BASE__: string;
