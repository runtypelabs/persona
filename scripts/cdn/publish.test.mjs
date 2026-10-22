import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertSameRelease, fileHashes, IMMUTABLE_CACHE, LATEST_CACHE, publish, purgeLatest, validateVersion, verifyLatest, verifyVersioned } from './publish.mjs';

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
  const names = ['install.global.js', 'index.global.js', 'launcher.global.js', 'client-stream.js', 'widget.css'];
  const hash = createHash('sha256').update('new').digest('hex');
  const hashes = new Map(names.map(name => [name, hash]));
  const response = (body, cache) => async () => new Response(body, { headers: { 'Cache-Control': cache } });
  await verifyLatest(hashes, response('new', LATEST_CACHE));
  await verifyLatest(hashes, response('new', 'no-cache, max-age=0, must-revalidate'));
  await verifyLatest(hashes, response('new', `no-cache, ${LATEST_CACHE}`));
  await assert.rejects(verifyLatest(hashes, response('old', LATEST_CACHE)), /different bytes/);
  for (const cache of [
    'public, max-age=31536000', 'no-cache, max-age=31536000', '',
    'public, max-age=3601', 'public, max-age=3600, s-maxage=86401',
    'public, max-age=3600, max-age=31536000', 'public, max-age=-1',
    'public, max-age=invalid', 'public', 'private, max-age=3600',
    `${LATEST_CACHE}, immutable`, `${LATEST_CACHE}, stale-while-revalidate=31536000`,
  ]) {
    await assert.rejects(verifyLatest(hashes, response('new', cache)), /Unsafe CDN response/);
  }
  await assert.rejects(verifyLatest(hashes, async url => new Response(
    url.endsWith('/launcher.global.js') ? 'old' : 'new', { headers: { 'Cache-Control': LATEST_CACHE } },
  )), /different bytes for launcher.global.js/);
});

test('public version verification checks every file and rejects cached errors and different bytes', async () => {
  const names = ['index.global.js', 'launcher.global.js', 'widget.css', 'chunks/lazy.js'];
  const hashes = new Map(names.map(name => [name, createHash('sha256').update(name).digest('hex')]));
  const urls = [];
  await verifyVersioned(hashes, '4.32.1', async url => {
    urls.push(url);
    return new Response(url.split('/4.32.1/')[1], { headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  assert.deepEqual(urls, names.map(name => `https://cdn.runtype.com/persona/4.32.1/${name}`));
  for (const status of [404, 503]) {
    await assert.rejects(verifyVersioned(hashes, '4.32.1', async url =>
      url.endsWith('/chunks/lazy.js') ? new Response('error', { status }) : new Response(url.split('/4.32.1/')[1], { headers: { 'Access-Control-Allow-Origin': '*' } }),
    ), new RegExp(`chunks/lazy.js: HTTP ${status}`));
  }
  await assert.rejects(verifyVersioned(hashes, '4.32.1', async () => new Response('stale')), /different bytes/);
  for (const allowOrigin of ['', 'https://one-customer.example']) {
    await assert.rejects(verifyVersioned(hashes, '4.32.1', async url =>
      new Response(url.split('/4.32.1/')[1], { headers: { 'Access-Control-Allow-Origin': allowOrigin } }),
    ), /lacks public CORS/);
  }
});

test('publishes and verifies versioned assets before latest; reruns preserve immutable bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'persona-publish-test-'));
  try {
    const dist = join(root, 'dist'), remote = join(root, 'remote');
    await mkdir(dist); await mkdir(remote);
    const names = ['install.global.js', 'index.global.js', 'launcher.global.js', 'client-stream.js', 'widget.css', 'ui-extras.js'];
    for (const name of names) await writeFile(join(dist, name), name);
    const calls = [];
    const publicChecks = [];
    const env = Object.fromEntries(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'CLOUDFLARE_ZONE_ID', 'CLOUDFLARE_API_TOKEN'].map(key => [key, 'test']));
    const run = async (_cmd, args) => {
      calls.push(args);
      if (args[3] === 'cp' && args[5].includes('/latest/')) {
        assert.deepEqual(publicChecks.toSorted(), names.map(name => `https://cdn.runtype.com/persona/4.32.1/${name}`).sort());
      }
      if (args[3] === 'sync') await cp(remote, args[5], { recursive: true });
      else if (args[5].includes('/4.32.1/')) await cp(dist, remote, { recursive: true });
      return { stdout: '' };
    };
    const fetchImpl = async (url) => {
      if (url.includes('/4.32.1/')) publicChecks.push(url);
      return url.includes('purge_cache') ? Response.json({ success: true }) : new Response(url.split('/').at(-1), { headers: { 'Cache-Control': LATEST_CACHE, 'Access-Control-Allow-Origin': '*' } });
    };
    const options = { dist, version: '4.32.1', latest: true, env, run, fetchImpl };
    await publish(options);
    const uploads = calls.filter(args => args[3] === 'cp');
    assert.equal(uploads[0][5], 's3://test/persona/4.32.1/');
    assert.ok(uploads[0].includes(IMMUTABLE_CACHE));
    assert.equal(uploads[1][5], 's3://test/persona/latest/');
    assert.ok(uploads[1].includes(LATEST_CACHE));
    assert.equal((await fileHashes(dist)).size, 6);
    calls.length = 0;
    publicChecks.length = 0;
    await publish(options);
    assert.equal(calls.filter(args => args[3] === 'cp').length, 1);
    for (const name of ['launcher.global.js', 'ui-extras.js']) {
      calls.length = 0;
      const requests = [];
      await assert.rejects(publish({ ...options, fetchImpl: async url => {
        requests.push(url);
        return url.endsWith(`/4.32.1/${name}`) ? new Response('cached missing file', { status: 404 }) : fetchImpl(url);
      } }), /Versioned CDN response failed/);
      assert.equal(calls.filter(args => args[3] === 'cp').length, 0, 'must not promote an unreachable release');
      assert.ok(requests.every(url => url.includes('/4.32.1/')), 'must not purge or verify latest on failure');
    }
    await writeFile(join(dist, 'index.global.js'), 'different');
    calls.length = 0;
    await assert.rejects(publish(options), /Refusing to overwrite/);
    assert.equal(calls.filter(args => args[3] === 'cp').length, 0);
    await assert.rejects(publish({ ...options, env: { ...env, CLOUDFLARE_API_TOKEN: '' } }), /Missing CLOUDFLARE_API_TOKEN/);
    await assert.rejects(publish({ ...options, version: '4.33.0-beta.1' }), /Prereleases/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
