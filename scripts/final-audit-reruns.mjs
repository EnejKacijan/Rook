// Explicit verification after investigating/fixing QA failures. The original
// RUN.json is never rewritten: both failed attempts and reruns remain visible.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(process.argv[2]);
const run = JSON.parse(await readFile(path.join(root, 'RUN.json'), 'utf8'));
if (!run.finishedAt) throw new Error('Finish the original runtime run first.');
const buildHash = createHash('sha256').update(await readFile('dist/index.html')).digest('hex');
if (buildHash !== run.buildHash) throw new Error('Build changed; use a new capture run.');
const reruns = [];
for (const previous of run.scripts.filter(item => item.code !== 0)) {
  const startedAt = new Date().toISOString();
  const result = await new Promise(resolve => {
    const child = spawn(process.execPath, ['--import', './scripts/qa-stable-screenshots.mjs', previous.script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const deadline = setTimeout(() => child.kill(), 600000);
    child.stdout.on('data', value => output += value);
    child.stderr.on('data', value => output += value);
    child.on('error', error => output += error.message);
    child.on('close', code => { clearTimeout(deadline); resolve({ code, output }); });
  });
  const item = { script: previous.script, startedAt, finishedAt: new Date().toISOString(), code: result.code };
  reruns.push(item);
  await writeFile(path.join(root, 'runtime-logs', path.basename(previous.script) + '.rerun.log'), result.output);
  await writeFile(path.join(root, 'RERUNS.json'), JSON.stringify({ buildHash, reruns }, null, 2));
  console.log(`${result.code === 0 ? 'PASS' : 'FAIL'} ${previous.script}`);
}
if (reruns.some(item => item.code !== 0)) process.exitCode = 1;
