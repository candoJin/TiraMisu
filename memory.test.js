import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { MemoryStore, memoryScope } from './memory.js';

function database(t) {
  const folder = mkdtempSync(join(tmpdir(), 'tiramisu-memory-'));
  const path = join(folder, 'memory.sqlite');
  const store = new MemoryStore(path);
  t.after(() => { try { store.close(); } catch {} rmSync(folder, { recursive: true, force: true }); });
  return { store, path };
}

test('Members share a server scope; other servers and DMs remain isolated', t => {
  const { store } = database(t);
  assert.equal(memoryScope('server-a', 'alice'), memoryScope('server-a', 'bob'));
  store.append(memoryScope('server-a', 'alice'), 'alice', '철수', '나는 민트초코를 좋아해', '기억할게.');
  assert.ok(JSON.stringify(store.context(memoryScope('server-a', 'bob'), '철수는 뭘 좋아해?', 'bob')).includes('민트초코'));
  assert.deepEqual(store.context(memoryScope('server-a', 'bob'), '뭘 좋아해?', 'bob'), []);
  assert.deepEqual(store.context(memoryScope('server-b', 'bob'), '철수', 'bob'), []);
  assert.deepEqual(store.context(memoryScope(null, 'bob'), '철수', 'bob'), []);
});

test('Disk memory is readable in a new process and old names retrieve older conversations', t => {
  const { store, path } = database(t);
  store.append('guild:a', 'alice', '철수', '내 고양이 이름은 호두야', '호두구나.');
  store.remember('guild:a', 'alice', '철수', '철수는 부산에 살아');
  for (let i = 0; i < 8; i++) store.append('guild:a', 'bob', '영희', `다른 대화 ${i}`, '응.');
  const moduleUrl = new URL('./memory.js', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e',
    `import {MemoryStore} from ${JSON.stringify(moduleUrl)};const s=new MemoryStore(process.argv[1]);console.log(JSON.stringify(s.context('guild:a','철수는 고양이가 있어?','bob')));s.close();`, path], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(child.stdout.includes('호두'));
  assert.ok(child.stdout.includes('부산'));
  assert.ok(child.stdout.includes('alice'));
});

test('Summaries preserve recent context and failed summaries never advance the checkpoint', t => {
  const { store } = database(t);
  for (let i = 0; i < 12; i++) store.append('guild:a', 'alice', '철수', `대화${i}`, `응${i}`);
  const job = store.compaction('guild:a', 'alice');
  assert.equal(job.turns.length, 6);
  assert.throws(() => store.saveSummary('guild:a', job, ''), /Invalid/);
  assert.equal(store.state('guild:a', 'alice').through_id, 0);
  store.saveSummary('guild:a', job, '철수는 티라미슈를 좋아한다고 말했다.');
  const context = JSON.stringify(store.context('guild:a', '오늘 이야기', 'alice'));
  assert.ok(context.includes('티라미슈'));
  assert.ok(context.includes('대화11'));
  assert.deepEqual(store.context('guild:a', '오늘 이야기', 'bob'), []);
  assert.ok(JSON.stringify(store.context('guild:a', '<@alice> 이야기', 'bob')).includes('티라미슈'));
  assert.throws(() => store.saveSummary('guild:a', job, 'stale'), /conflict/);
});

test('Notes enforce author permissions, scope, limits, and durable reset', t => {
  const { store, path } = database(t);
  const id = store.remember('guild:a', 'alice', '철수', '영희는 커피를 좋아해');
  assert.equal(store.forget('guild:b', id, 'alice', true), 'missing');
  assert.equal(store.forget('guild:a', id, 'bob', false), 'forbidden');
  assert.equal(store.forget('guild:a', id, 'bob', true), 'deleted');
  for (let i = 0; i < 20; i++) store.remember('guild:a', 'alice', '철수', `메모${i}`);
  assert.throws(() => store.remember('guild:a', 'bob', '영희', 'overflow'), /limit/);
  store.append('guild:a', 'alice', '철수', 'private old text', 'reply');
  store.remember('guild:b', 'bob', '영희', '다른 서버는 보존');
  store.reset('guild:a');
  const reopened = new MemoryStore(path);
  try {
    assert.deepEqual(reopened.context('guild:a', 'private old text', 'alice'), []);
    assert.equal(reopened.notes('guild:b').length, 1);
    assert.ok(reopened.boots >= 2);
  } finally { reopened.close(); }
});
