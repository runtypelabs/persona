import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { packedWidget } from './packed-widget.mjs';

test('accepts only the requested widget tarball with the publisher manifest integrity', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'packed-widget-'));
  try {
    await mkdir(join(dir, 'packages'));
    const path = 'packages/widget.tgz';
    await writeFile(join(dir, path), 'packed bytes');
    const release = { kind: 'publish', name: '@runtypelabs/persona', version: '4.35.3', tarball: {
      path, integrity: `sha256-${createHash('sha256').update('packed bytes').digest('base64')}`,
    } };
    const manifest = entry => writeFile(join(dir, 'publish-plan.json'), JSON.stringify({ version: 1, plan: [[entry]] }));
    await manifest(release);
    assert.equal(await packedWidget(dir, '4.35.3'), join(dir, path));
    await assert.rejects(packedWidget(dir, '4.35.4'), /Missing packed widget/);
    await manifest({ ...release, tarball: { ...release.tarball, path: '../outside.tgz' } });
    await assert.rejects(packedWidget(dir, '4.35.3'), /Invalid tarball path/);
    await manifest({ ...release, tarball: { ...release.tarball, path: '/outside.tgz' } });
    await assert.rejects(packedWidget(dir, '4.35.3'), /Invalid tarball path/);
    await manifest(release);
    await writeFile(join(dir, path), 'changed bytes');
    await assert.rejects(packedWidget(dir, '4.35.3'), /integrity mismatch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
