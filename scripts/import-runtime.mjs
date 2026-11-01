#!/usr/bin/env node
/** Mirror the exact browser Python runtime and course package dependency closure.
 * Run: node scripts/import-runtime.mjs
 * Dependencies: Node.js >= 20 and curl. No Python or npm package installation.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public/runtime/pyodide');
const version = '314.0.7';
const base = `https://cdn.jsdelivr.net/pyodide/v${version}/full/`;
const limit = 25 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = { version, source: base, importedAt: new Date().toISOString(), packages: [], files: [] };
await mkdir(output, { recursive: true });
async function download(url, filename, expectedHash) {
  const destination = join(output, filename);
  let bytes;
  try { bytes = await readFile(destination); if (expectedHash && sha256(bytes) !== expectedHash) bytes = null; } catch { /* First import. */ }
  if (!bytes) {
    const temporary = `${destination}.part`;
    await exec('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--retry-delay', '1', '--connect-timeout', '30', '--max-time', '300', '--output', temporary, url]);
    bytes = await readFile(temporary);
    if (expectedHash && sha256(bytes) !== expectedHash) { await rm(temporary, { force: true }); throw new Error(`SHA256 mismatch: ${filename}`); }
    if (bytes.length > limit) { await rm(temporary, { force: true }); throw new Error(`Exceeds Cloudflare 25 MiB asset limit: ${filename} (${(bytes.length / 1048576).toFixed(2)} MiB)`); }
    await rename(temporary, destination);
  }
  if (bytes.length > limit) throw new Error(`Asset too large: ${filename}`);
  const item = { file: filename, bytes: bytes.length, sha256: sha256(bytes), source: url };
  manifest.files.push(item);
  process.stdout.write(`${filename} ${(bytes.length / 1048576).toFixed(2)} MiB\n`);
  return bytes;
}
const upstreamBytes = await download(`${base}pyodide-lock.json`, 'pyodide-lock.upstream.json');
const lock = JSON.parse(upstreamBytes);
const packages = {};
const seeds = ['numpy', 'pandas', 'matplotlib', 'scipy', 'sympy', 'scikit-learn', 'beautifulsoup4', 'lxml', 'requests'];
function addPackage(name) {
  if (packages[name]) return;
  const metadata = lock.packages[name];
  if (!metadata) throw new Error(`Package is absent from the upstream lock: ${name}`);
  packages[name] = metadata;
  for (const dependency of metadata.depends || []) addPackage(dependency);
}
seeds.forEach(addPackage);
// Seaborn is pure Python and used by this course. Pin its wheel and hash from PyPI.
const seabornVersion = '0.13.2';
const { stdout: seabornMetadata } = await exec('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '60', `https://pypi.org/pypi/seaborn/${seabornVersion}/json`], { maxBuffer: 4 * 1024 * 1024 });
const seabornWheel = JSON.parse(seabornMetadata).urls.find(file => file.filename.endsWith('-py3-none-any.whl'));
if (!seabornWheel) throw new Error('Pinned Seaborn wheel is unavailable');
packages.seaborn = { name: 'seaborn', version: seabornVersion, file_name: seabornWheel.filename, install_dir: 'site', package_type: 'package', imports: ['seaborn'], depends: ['numpy', 'pandas', 'matplotlib'], sha256: seabornWheel.digests.sha256, unvendored_tests: false };
const jobs = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide.mjs.map'].map(file => ({ file, url: base + file }));
for (const [name, pkg] of Object.entries(packages)) jobs.push({ file: pkg.file_name, url: name === 'seaborn' ? seabornWheel.url : base + pkg.file_name, hash: pkg.sha256 });
const queue = [...jobs];
await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const job = queue.shift(); await download(job.url, job.file, job.hash); } }));
manifest.packages = Object.entries(packages).map(([name, pkg]) => ({ name, version: pkg.version, dependencies: pkg.depends }));
manifest.files.sort((a, b) => a.file.localeCompare(b.file));
// Only advertise bundled packages: arbitrary imports cannot fall back to a CDN.
await writeFile(join(output, 'pyodide-lock.json'), JSON.stringify({ ...lock, packages }, null, 2) + '\n');
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const total = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
process.stdout.write(`Mirrored ${manifest.packages.length} packages; ${manifest.files.length} files; ${(total / 1048576).toFixed(2)} MiB.\n`);
