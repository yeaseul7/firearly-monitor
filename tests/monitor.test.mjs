import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractVersions } from '../scripts/monitor.mjs';

const entry = new URL('../scripts/monitor.mjs', import.meta.url).href;
function page(titles, version = 'v1.0', description = 'Description') {
  return `<div class="games-grid">${titles.map(title => `<article class="game-card"><div class="game-copy"><h2>${title}<span class="game-version">${version}</span></h2><p>${description}</p></div></article>`).join('')}</div>`;
}

test('게임 제목과 버전을 추출하고 버전 없는 컬렉션을 제외한다', () => {
  assert.deepEqual(extractVersions(page(['B', 'A'])), { A: 'v1.0', B: 'v1.0' });
  assert.deepEqual(extractVersions(page(['A'], 'v2.0', 'Changed')), { A: 'v2.0' });
  assert.deepEqual(extractVersions(page(['A']) + page(['Collection'], '')), { A: 'v1.0' });
  assert.throws(() => extractVersions('<body>Error</body>'));
  assert.throws(() => extractVersions(page([''])));
  assert.throws(() => extractVersions(page(['A'], 'invalid')));
  assert.throws(() => extractVersions(page(['A', 'A'])));
});

test('최초 기준, 버전 변경·추가 통합 알림, 삭제 무알림, 전송 실패 처리', () => {
  const dir = mkdtempSync(join(tmpdir(), 'firearly-test-'));
  const snapshotPath = join(dir, 'data/versions.json');
  const snapshot = () => JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const run = (html, status = 204) => {
    const code = `globalThis.fetch=async(url, options)=>{
      if(url==='https://discord.invalid') { console.log('NOTIFY:'+options.body);return new Response(null,{status:${status}}); }
      return new Response(${JSON.stringify(html)});
    };const {main}=await import(${JSON.stringify(entry)});await main().catch(e=>{console.error(e.message);process.exitCode=1;});`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: dir, env: { ...process.env, DISCORD_WEBHOOK_URL: 'https://discord.invalid' }, encoding: 'utf8'
    });
  };
  const success = result => assert.equal(result.status, 0, result.stderr);
  const silent = result => { success(result); assert(!result.stdout.includes('NOTIFY:')); };
  try {
    silent(run(page(['A', 'B'])));
    assert.deepEqual(snapshot(), { A: 'v1.0', B: 'v1.0' });
    silent(run(page(['B', 'A'], 'v1.0', 'New intro')));
    silent(run(page(['A'])));
    assert.deepEqual(snapshot(), { A: 'v1.0' });
    const before = readFileSync(snapshotPath, 'utf8');
    assert.equal(run(page(['A', 'C'], 'v2.0'), 500).status, 1);
    assert.equal(readFileSync(snapshotPath, 'utf8'), before);
    const added = run(page(['C', 'A'], 'v2.0'));
    success(added);
    const payload = JSON.parse(added.stdout.split('NOTIFY:')[1].split('\n')[0]);
    assert.match(payload.embeds[0].description, /🆕 \*\*C\*\*\n신규 등록: v2.0/);
    assert.match(payload.embeds[0].description, /v1.0 → \*\*v2.0\*\*/);
    assert.equal(added.stdout.split('NOTIFY:').length - 1, 1);
    assert.deepEqual(snapshot(), { A: 'v2.0', C: 'v2.0' });
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    silent(run(page(['C', 'A'], 'v2.0')));
    const good = readFileSync(snapshotPath, 'utf8');
    assert.equal(run('<body>Error</body>').status, 1);
    assert.equal(readFileSync(snapshotPath, 'utf8'), good);
    writeFileSync(snapshotPath, '{}');
    assert.equal(run(page(['A'])).status, 1);
    assert.equal(readFileSync(snapshotPath, 'utf8'), '{}');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
