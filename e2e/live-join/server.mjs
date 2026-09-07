import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const port = Number(process.env.PERSONA_JOIN_PORT || 4318);
const dist = resolve(process.env.PERSONA_JOIN_DIST || "packages/widget/dist");
const fixtureFile = process.env.PERSONA_JOIN_FIXTURE;
if (!fixtureFile)
  throw new Error(
    "PERSONA_JOIN_FIXTURE must point to a locally provisioned Core fixture",
  );
const types = {
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".html": "text/html",
};
createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file =
      pathname === "/"
        ? resolve("e2e/live-join/index.html")
        : pathname === "/fixture.json"
          ? fixtureFile
          : resolve(dist, `.${pathname}`);
    if (
      pathname !== "/" &&
      pathname !== "/fixture.json" &&
      !file.startsWith(`${dist}/`)
    ) {
      res.writeHead(404).end();
      return;
    }
    const contents = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(contents);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Persona live join fixture on ${port}`),
);
