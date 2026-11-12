import test from 'node:test';
import assert from 'node:assert/strict';
import { BotDialogue } from './bot-dialogue.js';

function setup(extra = {}) {
  const calls = [];
  const sent = [];
  const ended = [];
  const manager = new BotDialogue({
    respond: async (session, text) => { calls.push(text); return 'reply'; },
    send: async (session, reply) => { const message = { id: `sent-${sent.length + 1}`, reply }; sent.push(message); return message; },
    onEnd: async (session, reason) => { ended.push(reason); }, ...extra,
  });
  const start = () => manager.start({ channelId: 'channel', targetId: 'rime', initiatorId: 'human', topic: '인사' });
  const receive = (extra = {}) => manager.receive({ channelId: 'channel', authorId: 'rime', content: 'reply', mentionsBot: true, ...extra });
  return { manager, calls, sent, ended, start, receive };
}

test('Three complete round trips use exactly three API calls; later bot messages cannot restart it', async () => {
  const t = setup();
  await t.start();
  await t.receive(); await t.receive(); await t.receive();
  for (let i = 0; i < 10; i++) await t.receive();
  assert.equal(t.calls.length, 3);
  assert.equal(t.sent.length, 3);
  assert.equal(t.manager.sessions.size, 0);
  await Promise.resolve();
  assert.deepEqual(t.ended, ['complete']);
});

test('Other bots, channels and unrelated partner messages do not trigger API calls', async () => {
  const t = setup();
  await t.start();
  await t.receive({ authorId: 'unrelated' });
  await t.receive({ channelId: 'another' });
  await t.receive({ mentionsBot: false, replyTo: 'unrelated' });
  await t.receive({ mentionsBot: true, replyTo: 'stale-dialogue-message' });
  await t.receive({ content: '' });
  assert.equal(t.calls.length, 1);
  await t.receive({ mentionsBot: false, replyTo: 'sent-1' });
  assert.equal(t.calls.length, 2);
  t.manager.close();
});

test('Duplicate incoming events during generation cannot spend an extra turn', async () => {
  let release;
  let calls = 0;
  const t = setup({ respond: async () => { calls++; if (calls === 2) await new Promise(resolve => { release = resolve; }); return 'reply'; } });
  await t.start();
  const pending = t.receive();
  await t.receive(); await t.receive();
  assert.equal(calls, 2);
  release(); await pending;
  assert.equal(t.sent.length, 2);
  t.manager.close();
});

test('Stopping in-flight generation prevents its message and any subsequent API requests', async () => {
  let release;
  const t = setup({ respond: async () => { await new Promise(resolve => { release = resolve; }); return 'reply'; } });
  const pending = t.start();
  assert.equal(t.manager.stop('channel', 'stranger'), 'forbidden');
  assert.equal(t.manager.stop('channel', 'human'), 'stopped');
  release(); await pending;
  assert.equal(t.sent.length, 0);
  await t.receive();
  assert.equal(t.manager.sessions.size, 0);
});

test('Timeout ends a silent partner session without extra model calls', async () => {
  const t = setup({ timeoutMs: 15 });
  await t.start();
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(t.manager.sessions.size, 0);
  assert.equal(t.calls.length, 1);
  assert.deepEqual(t.ended, ['timeout']);
});

test('A fast partner response arriving before send resolves is processed once', async () => {
  let sends = 0;
  const t = setup({ send: async () => {
    sends++;
    if (sends === 1) await t.receive({ replyTo: 'fast-1' });
    return { id: `fast-${sends}` };
  } });
  await t.start();
  assert.equal(t.calls.length, 2);
  assert.equal(sends, 2);
  t.manager.close();
});
