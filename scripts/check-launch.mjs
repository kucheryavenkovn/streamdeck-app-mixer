import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { access, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { AudioBridge } from '../src/bridge.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const executable = path.join(root, 'dist/local.tux.appmixer.sdPlugin/bin/native/AudioBridge.exe');
const info = key => JSON.parse(execFileSync(executable, ['--launch-info', key], { encoding: 'utf8' }));
assert.equal(info(executable).kind, 'desktop');
if (process.argv[2]) {
  const packaged = info(process.argv[2]);
  assert.equal(packaged.kind, 'package'); assert.match(packaged.applicationId, /^[A-Za-z0-9.-]+_[a-z0-9]{13}![A-Za-z0-9.-]+$/);
  console.log(`PASS: Store launch target ${packaged.applicationId} (not launched).`);
}
execFileSync('dotnet', ['publish', 'native/LaunchProbe/LaunchProbe.csproj', '-c', 'Release', '-r', 'win-x64', '--self-contained', 'false', '-o', path.join(root, 'dist/launch-probe')], { cwd: root, stdio: 'pipe' });
const probe = path.join(root, 'dist/launch-probe/LaunchProbe.exe');
const marker = path.join(root, 'dist/launch-probe/started.txt');
try { await unlink(marker); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const bridge = new AudioBridge(executable);
try {
  assert.equal((await bridge.request('launch', { key: executable })).launch.status, 'already-running');
  for (const key of ['system-sounds', 'https://example.com/test.exe', 'C:\\Windows\\test.cmd']) {
    await assert.rejects(bridge.request('launch', { key }));
  }
  assert.equal((await bridge.request('launch', { key: probe })).launch.status, 'started');
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    try { await access(marker); break; } catch { await delay(50); }
  }
  assert.match(await readFile(marker, 'utf8'), /^\d+$/);
  console.log('PASS: already-running process is not relaunched; non-EXE/remote targets rejected; OWN benign WinExe probe launched successfully.');
} finally { bridge.close(); }
