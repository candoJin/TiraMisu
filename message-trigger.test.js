import test from 'node:test';
import assert from 'node:assert/strict';
import { humanMessagePrompt } from './message-trigger.js';

const make = (content, overrides = {}) => ({ author: { id: 'person', bot: false }, guildId: 'guild', content,
  mentions: { users: new Set(content?.includes('<@100>') || content?.includes('<@!100>') ? ['100'] : []) }, ...overrides });

test('Human mention prompts need no slash and preserve other person mentions', () => {
  assert.deepEqual(humanMessagePrompt(make('<@100> 안녕'), '100'), { source: 'mention', text: '안녕' });
  assert.deepEqual(humanMessagePrompt(make('<@!100> <@200>는 뭘 좋아해?'), '100'), { source: 'mention', text: '<@200>는 뭘 좋아해?' });
  assert.equal(humanMessagePrompt(make('그냥 하는 대화'), '100'), null);
  assert.equal(humanMessagePrompt(make('<@200> 안녕'), '100'), null);
});

test('Bots, webhooks and self messages never enter the human response path', () => {
  assert.equal(humanMessagePrompt(make('<@100> 계속 답해', { author: { id: 'rime', bot: true } }), '100'), null);
  assert.equal(humanMessagePrompt(make('<@100> 안녕', { webhookId: 'hook' }), '100'), null);
  assert.equal(humanMessagePrompt(make('<@100> 안녕', { author: { id: '100', bot: false } }), '100'), null);
});

test('Direct messages need no mention, empty mentions greet, unavailable content is ignored', () => {
  assert.deepEqual(humanMessagePrompt(make('안녕', { guildId: null }), '100'), { source: 'dm', text: '안녕' });
  assert.equal(humanMessagePrompt(make('', { guildId: null }), '100'), null);
  assert.deepEqual(humanMessagePrompt(make('<@100>'), '100'), { source: 'mention', text: '안녕. 불렀어.' });
  assert.equal(humanMessagePrompt(make('', { mentions: { users: new Set(['100']) } }), '100'), null);
});
