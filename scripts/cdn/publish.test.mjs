import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertSameRelease, fileHashes, IMMUTABLE_CACHE, LATEST_CACHE, publish, purgeLatest, validateVersion, verifyLatest } from './publish.mjs';

test('requires exact safe release versions', () => {
  for (const value of ['4.32.1', '4.33.0-beta.1', '4.33.0+build.1']) assert.equal(validateVersion(value), value);
  for (const value of ['latest', '../latest', '4', '', undefined]) assert.throws(() => validateVersion(value));
});

test('rejects mutation, removal and additions in an immutable release', () => {
  const original = new Map([['index.js', 'one']]);
  assert.doesNotThrow(() => assertSameRelease(original, new Map(original)));
  for (const changed of [new Map([['index.js', 'two']]), new Map(), new Map([...original, ['extra.js', 'one']])]) {
    assert.throws(() => assertSameRelease(original, changed), /Refusing to overwrite/);
  }
});

test('purges only latest files, in bounded batches, and fails on API errors', async () => {
  const requests = [];
  const opts = { zoneId: 'zone', token: 'test', fetchImpl: async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    return Response.json({ success: true });
  } };
  await purgeLatest(Array.from({ length: 65 }, (_, i) => `${i}.js`), opts);
  assert.deepEqual(requests.map(r => r.body.files.length), [30, 30, 5]);
  assert.ok(requests.every(r => r.body.files.every(url => url.startsWith('https://cdn.runtype.com/persona/latest/'))));
  await assert.rejects(purgeLatest(['index.js'], { ...opts, fetchImpl: async () => Response.json({ success: false }, { status: 403 }) }), /purge failed/);
});

test('verification rejects stale bytes and TTL overrides on the mutable URL', async () => {
  const names = ['install.global.js', 'index.global.js', 'client-stream.js', 'widget.css'];
  const hash = createHash('sha256').update('new').digest('hex');
  const hashes = new Map(names.map(name => [name, hash]));
  const response = (body, cache) => async () => new Response(body, { headers: { 'Cache-Control': cache } });
  await verifyLatest(hashes, response('new', LATEST_CACHE));
  await assert.rejects(verifyLatest(hashes, response('old', LATEST_CACHE)), /different bytes/);
  for (const cache of ['public, max-age=31536000', 'no-cache, max-age=31536000', '']) {
    await assert.rejects(verifyLatest(hashes, response('new', cache)), /Unsafe CDN response/);
  }
});

test('publishes and verifies versioned assets before latest; reruns preserve immutable bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'persona-publish-test-'));
  try {
    const dist = join(root, 'dist'), remote = join(root, 'remote');
    await mkdir(dist); await mkdir(remote);
    const names = ['install.global.js', 'index.global.js', 'launcher.global.js', 'client-stream.js', 'widget.css'];
    for (const name of names) await writeFile(join(dist, name), name);
    const calls = [];
    const env = Object.fromEntries(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN'].map(key => [key, 'test']));
    const run = async (_cmd, args) => {
      calls.push(args);
      if (args[3] === 'sync') await cp(remote, args[5], { recursive: true });
      else if (args[5].includes('/4.32.1/')) await cp(dist, remote, { recursive: true });
      return { stdout: '' };
    };
    const fetchImpl = async (url) => url.includes('purge_cache') ? Response.json({ success: true }) : new Response(url.split('/').at(-1), { headers: { 'Cache-Control': LATEST_CACHE } });
    const options = { dist, version: '4.32.1', latest: true, env, run, fetchImpl };
    await publish(options);
    const uploads = calls.filter(args => args[3] === 'cp');
    assert.equal(uploads[0][5], 's3://test/persona/4.32.1/');
    assert.ok(uploads[0].includes(IMMUTABLE_CACHE));
    assert.equal(uploads[1][5], 's3://test/persona/latest/');
    assert.ok(uploads[1].includes(LATEST_CACHE));
    assert.equal((await fileHashes(dist)).size, 5);
    calls.length = 0;
    await publish(options);
    assert.equal(calls.filter(args => args[3] === 'cp').length, 1);
    await writeFile(join(dist, 'index.global.js'), 'different');
    calls.length = 0;
    await assert.rejects(publish(options), /Refusing to overwrite/);
    assert.equal(calls.filter(args => args[3] === 'cp').length, 0);
    await assert.rejects(publish({ ...options, env: { ...env, CLOUDFLARE_API_TOKEN: '' } }), /Missing CLOUDFLARE_API_TOKEN/);
    await assert.rejects(publish({ ...options, version: '4.33.0-beta.1' }), /Prereleases/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
