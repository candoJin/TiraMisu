import test from 'node:test';
import assert from 'node:assert/strict';
import { generateReply, splitReply } from './chat.js';

test('Responses payload keeps persona separate and disables stored responses', async () => {
  let request;
  const reply = await generateReply({
    apiKey: 'test-only', model: 'chosen-model', instructions: 'persona',
    history: [{ role: 'user', content: 'earlier' }], text: 'hello',
    fetchImpl: async (url, options) => {
      request = { url, ...options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ status: 'completed', output: [
        { type: 'reasoning', content: [] },
        { type: 'message', content: [{ type: 'output_text', text: '응.' }] },
      ] }) };
    },
  });
  assert.equal(reply, '응.');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.body.model, 'chosen-model');
  assert.equal(request.body.instructions, 'persona');
  assert.equal(request.body.store, false);
  assert.deepEqual(request.body.input, [{ role: 'user', content: 'earlier' }, { role: 'user', content: 'hello' }]);
});

test('Provider errors expose only status, without sensitive response body', async () => {
  await assert.rejects(generateReply({ apiKey: 'test-only', history: [], text: 'hi',
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => { throw new Error('must not read'); } }),
  }), error => error.status === 401 && error.message === 'OpenAI request failed');
});

test('Incomplete and empty responses are rejected instead of saved as successful turns', async () => {
  for (const body of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [] }]) {
    await assert.rejects(generateReply({ apiKey: 'test-only', history: [], text: 'hi',
      fetchImpl: async () => ({ ok: true, json: async () => body }),
    }));
  }
});

test('Long Unicode output fits Discord message limits without splitting surrogate pairs', () => {
  const text = '가😀'.repeat(2500);
  const chunks = splitReply(text);
  assert.equal(chunks.join(''), text);
  assert.ok(chunks.every(chunk => chunk.length <= 1900 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)));
});
