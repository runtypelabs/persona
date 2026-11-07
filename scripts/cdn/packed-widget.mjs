import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { validateVersion } from './publish.mjs';

export async function packedWidget(directory, version) {
  validateVersion(version);
  const manifest = JSON.parse(await readFile(resolve(directory, 'publish-plan.json'), 'utf8'));
  const release = manifest.version === 1 && manifest.plan.flat().find(entry =>
    entry.kind === 'publish' && entry.name === '@runtypelabs/persona' && entry.version === version);
  if (!release) throw new Error(`Missing packed widget ${version}`);
  const tarball = release.tarball;
  if (!/^packages\/[\w.+-]+\.tgz$/.test(tarball?.path ?? '')) throw new Error('Invalid tarball path');
  const path = resolve(directory, tarball.path);
  const integrity = `sha256-${createHash('sha256').update(await readFile(path)).digest('base64')}`;
  if (integrity !== tarball.integrity) throw new Error('Packed widget integrity mismatch');
  return path;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [, , directory, dist, version] = process.argv;
  const tarball = await packedWidget(directory, version);
  await mkdir(dist, { recursive: true });
  await promisify(execFile)('tar', ['-xzf', tarball, '-C', dist, '--strip-components=2', 'package/dist']);
}
