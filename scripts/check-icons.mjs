import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = path.join(root, 'dist/local.tux.appmixer.sdPlugin/bin/native/AudioBridge.exe');
const fixtures = await mkdtemp(path.join(root, 'dist/icon-fixtures-'));
const assets = path.join(fixtures, 'Assets');
await mkdir(assets);
await mkdir(path.join(fixtures, 'bin'));
const png = await readFile(path.join(root, 'dist/local.tux.appmixer.sdPlugin/images/mixer.png'));
for (const name of ['Logo.scale-100.png', 'Logo.targetsize-48_altform-unplated.png', 'Logo.targetsize-256_altform-unplated.png', 'Other.png']) await writeFile(path.join(assets, name), png);
await writeFile(path.join(fixtures, 'AppxManifest.xml'), `<?xml version="1.0"?><Package xmlns="urn:test" xmlns:uap="urn:visual"><Applications>
<Application Executable="Other.exe"><uap:VisualElements Square44x44Logo="Assets\\Other.png"/></Application>
<Application Executable="bin\\Music.exe"><uap:VisualElements Square44x44Logo="Assets\\Logo.png"/></Application>
</Applications></Package>`);
const info = file => JSON.parse(execFileSync(executable, ['--icon-info', file], { encoding: 'utf8' }));
const result = info(path.join(fixtures, 'bin/Music.exe'));
assert.equal(result.source, path.join(assets, 'Logo.targetsize-256_altform-unplated.png'));
assert.ok(result.bytes > 100);
assert.equal(info(path.join(fixtures, 'Other.exe')).source, path.join(assets, 'Other.png'));
console.log('PASS: packaged application matching, namespace handling, parent package discovery and unplated high-resolution PNG selection.');
if (process.argv[2]) {
  const actual = info(process.argv[2]);
  assert.match(actual.source, /\.png$/i);
  console.log(`PASS: actual package logo loaded from ${actual.source}`);
}
