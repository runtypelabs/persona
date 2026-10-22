# CDN releases and cache recovery

Pin production embeds to an exact release, for example:

```html
<script src="https://cdn.runtype.com/persona/4.32.1/install.global.js"></script>
```

For a direct global install, use the same release directory for `index.global.js` and `widget.css`. Versioned releases also exist on npm CDNs. Replace the version above when intentionally upgrading.

New first-party `/persona/latest/` installer, launcher, and global bundles embed their package version and load dependencies from `/persona/<version>/`. A cached entry therefore keeps loading its matching release after a deployment. Explicit versioned paths, custom hosts, and installer URL overrides retain their existing behavior. Older bundles published before this fix still require a pinned embed or a browser cache refresh.

## Publishing

The automatic release and manual **Publish to R2 CDN** workflow share one publisher. The manual workflow accepts an exact npm release tag such as `@runtypelabs/persona@4.32.1`; it runs the publisher from the selected workflow branch and downloads that version's npm tarball. It does not rebuild the historical tag.

The publisher:

1. Downloads the exact published npm artifact, avoiding a second build from a different revision.
2. Uploads and verifies `/persona/<version>/` in R2 and checks every file through its public CDN URL before updating `/latest/`. Existing versioned files must match byte-for-byte; otherwise publishing fails without replacing them. Cached CDN errors or different public bytes also block promotion.
3. Uses `public, max-age=31536000, immutable` for new versioned objects, and `public, max-age=3600, s-maxage=86400, must-revalidate` for `/latest/` objects. Moving URLs can be reused for one hour in browsers and one day at the edge; each release purges the edge copy. The small installer resolves its larger dependencies to its own immutable release, so a cached installer remains compatible. Browser caches may delay an update for up to an hour; CDN purges cannot evict them.
4. Purges only the uploaded `/persona/latest/` URLs, then checks the entry, installer, launcher, stream chunk, and stylesheet for matching bytes and cache headers bounded by those TTLs. Failure is reported as a failed deployment. Temporary `no-cache`/`no-store` responses are also accepted with a warning, allowing a fixed release to be deployed while the emergency bypass remains active; they do not confirm that the permanent performance policy is restored.

Both automatic and manual publishers use the same concurrency group. Prereleases and versions older than the highest stable release tag cannot replace `/latest/`.

Required repository configuration:

- Existing secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Optional variable: `R2_BUCKET` (defaults to `cdn-assets`).
- Variable: `CLOUDFLARE_ZONE_ID`, the zone serving `cdn.runtype.com`.
- Secret: `CLOUDFLARE_API_TOKEN`, scoped to **Zone / Cache Purge / Purge** for that zone. This token does not need permission to change cache rules.

Publishing `/latest/` fails before uploading if the purge configuration is missing. Cloudflare settings must also respect object Cache-Control: remove any matching rule or Browser Cache TTL override that assigns a long TTL to `/persona/latest/`. Configure the scoped cache rule's Edge TTL and Browser TTL to **Respect origin**, and make sure a later rule does not override it. For immediate recovery before origin metadata is corrected, a last-matching rule may bypass edge caching for `https://cdn.runtype.com/persona/latest/*`; pair it with a Cache Response Rule that adds `no-cache` for browsers. Verify the actual response headers, since bypassing the edge alone does not guarantee browser revalidation. See [Cloudflare's cache rule settings](https://developers.cloudflare.com/cache/how-to/cache-rules/settings/).

## Recovering stale latest assets

1. Move affected embeds to an exact version, including CSS. An edge purge cannot evict files already cached in a visitor's browser.
2. Correct Cloudflare rules that override `/persona/latest/` cache headers. Keep immutable caching for versioned paths.
3. Configure the purge credential and run the manual publisher for the current stable npm release. It applies origin metadata, purges the mutable URLs, and verifies what the public CDN returns.
4. If an existing versioned release differs from the npm artifact, publish a new package version; do not overwrite an immutable release. An interrupted upload is also rejected if its files are incomplete, so inspect the failed deployment before retrying with a new version.
5. Verify a chat turn with the deployed assets. Confirm that the script entry's dependencies use a single immutable release directory. Then replace the temporary latest-path bypass with an eligible-for-cache rule that respects origin Edge TTL and Browser TTL, without a status-code TTL override. Disable the temporary response rule adding `no-cache`, purge `/persona/latest/`, and confirm one-hour browser/one-day edge caching on public latest responses. Verify an edge cache hit and a repeat browser visit reusing the installer and versioned assets.

A cache-busting query is useful for diagnosis but does not repair the cache keys used by existing customers. Republishing without a purge and corrected cache policy is insufficient.
