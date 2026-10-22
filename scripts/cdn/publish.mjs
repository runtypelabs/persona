import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

export const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
export const LATEST_CACHE = 'public, max-age=3600, s-maxage=86400, must-revalidate';
const CDN = 'https://cdn.runtype.com';
const exec = promisify(execFile);

export function validateVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
    throw new Error('Expected an exact Persona release version');
  }
  return version;
}

export async function fileHashes(dir) {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile());
  const result = new Map();
  for (const file of files) {
    const path = join(file.parentPath, file.name);
    const name = path.slice(resolve(dir).length + 1).replaceAll('\\', '/');
    result.set(name, createHash('sha256').update(await readFile(path)).digest('hex'));
  }
  return result;
}

export function assertSameRelease(expected, existing) {
  if (expected.size !== existing.size || [...expected].some(([name, hash]) => existing.get(name) !== hash)) {
    throw new Error('Refusing to overwrite an existing versioned release with different files. Publish a new version.');
  }
}

export async function purgeLatest(files, { zoneId, token, fetchImpl = fetch }) {
  const urls = [...files].map(name => `${CDN}/persona/latest/${name}`);
  for (let start = 0; start < urls.length; start += 30) {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: urls.slice(start, start + 30) }),
    });
    const body = await response.json();
    if (!response.ok || body.success !== true) {
      throw new Error(`Cloudflare cache purge failed (${response.status}): ${JSON.stringify(body.errors ?? [])}`);
    }
  }
}

function safeLatestCache(cache) {
  const directives = cache.toLowerCase().split(',').map(part => part.trim().split(/\s*=\s*/));
  const has = name => directives.some(([key]) => key === name);
  if (has('immutable') || has('private') || has('stale-while-revalidate') || has('stale-if-error')) return false;
  for (const [key, value] of directives) {
    const limit = key === 'max-age' ? 3600 : key === 's-maxage' ? 86400 : undefined;
    if (limit !== undefined && (!/^\d+$/.test(value ?? '') || Number(value) > limit)) return false;
  }
  // Permit the conservative emergency policy while a pinned release is being
  // rolled out. Restore caching only after its public assets are verified.
  return has('no-cache') || has('no-store') || (has('public') && has('max-age'));
}

export async function verifyLatest(hashes, fetchImpl = fetch) {
  for (const name of ['install.global.js', 'index.global.js', 'launcher.global.js', 'client-stream.js', 'widget.css']) {
    const response = await fetchImpl(`${CDN}/persona/latest/${name}`);
    const cache = response.headers.get('cache-control') ?? '';
    if (!response.ok || !safeLatestCache(cache)) {
      throw new Error(`Unsafe CDN response for ${name}: HTTP ${response.status}, Cache-Control: ${cache}. Check Cloudflare cache rules and Browser Cache TTL overrides.`);
    }
    const hash = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    if (hash !== hashes.get(name)) throw new Error(`CDN still serves different bytes for ${name} after purge`);
    if (/(?:no-cache|no-store)/i.test(cache)) {
      console.warn(`CDN ${name} is verified but still uses emergency revalidation; restore the bounded cache policy after rollout.`);
    }
  }
}

export async function verifyVersioned(hashes, version, fetchImpl = fetch) {
  // Check the URLs browsers actually load, including every lazy chunk. R2
  // equality alone cannot detect cached CDN errors or response transformations.
  for (const [name, expected] of hashes) {
    const url = `${CDN}/persona/${version}/${name}`;
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`Versioned CDN response failed for ${url}: HTTP ${response.status}`);
    const hash = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    if (hash !== expected) throw new Error(`Versioned CDN serves different bytes for ${url}`);
    // Prefetches can omit Origin and seed the browser cache before import().
    // Public modules must allow CORS even on those origin-less responses.
    if (/\.m?js$/.test(name) && response.headers.get('access-control-allow-origin') !== '*') {
      throw new Error(`Versioned CDN lacks public CORS for ${url}. Set Access-Control-Allow-Origin: * on public Persona assets, including responses without an Origin request header.`);
    }
  }
}

export async function publish({ dist, version, latest, env = process.env, run = exec, fetchImpl = fetch }) {
  validateVersion(version);
  if (latest && version.split('+')[0].includes('-')) throw new Error('Prereleases cannot update latest');
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  if (latest) required.push('CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN');
  for (const key of required) if (!env[key]) throw new Error(`Missing ${key}; no CDN files were changed`);
  const hashes = await fileHashes(resolve(dist));
  for (const name of ['install.global.js', 'index.global.js', 'launcher.global.js', 'client-stream.js', 'widget.css']) {
    if (!hashes.has(name)) throw new Error(`Incomplete release: missing ${name}`);
  }
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  const aws = args => run('aws', ['--endpoint-url', endpoint, ...args], {
    env: { ...env, AWS_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION: 'auto', AWS_PAGER: '' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const prefix = `s3://${env.R2_BUCKET}/persona/${version}/`;
  const existing = await mkdtemp(join(tmpdir(), 'persona-cdn-'));
  try {
    // Never replace immutable release bytes, including on a manual rerun.
    await aws(['s3', 'sync', prefix, existing, '--no-progress', '--only-show-errors']);
    const previous = await fileHashes(existing);
    if (previous.size) {
      assertSameRelease(hashes, previous);
      console.log(`Version ${version} already exists with identical files`);
    } else {
      await aws(['s3', 'cp', dist, prefix, '--recursive', '--cache-control', IMMUTABLE_CACHE, '--no-progress', '--only-show-errors']);
    }
    // Verify the complete immutable release before making any mutable entry live.
    await aws(['s3', 'sync', prefix, existing, '--no-progress', '--only-show-errors']);
    assertSameRelease(hashes, await fileHashes(existing));
  } finally {
    await rm(existing, { recursive: true, force: true });
  }
  await verifyVersioned(hashes, version, fetchImpl);
  if (latest) {
    await aws(['s3', 'cp', dist, `s3://${env.R2_BUCKET}/persona/latest/`, '--recursive', '--cache-control', LATEST_CACHE, '--no-progress', '--only-show-errors']);
    await purgeLatest(hashes.keys(), { zoneId: env.CLOUDFLARE_ZONE_ID, token: env.CLOUDFLARE_API_TOKEN, fetchImpl });
    await verifyLatest(hashes, fetchImpl);
  }
  console.log(`Published Persona ${version}${latest ? ' and verified latest' : ''}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await publish({ dist: process.argv[2], version: process.argv[3], latest: process.argv[4] === '--latest' });
}
