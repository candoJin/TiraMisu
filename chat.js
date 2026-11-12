export function extractText(response) {
  return (response.output ?? []).flatMap(item => item.type === 'message' ? item.content ?? [] : [])
    .filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
}

export async function generateReply({ apiKey, model, instructions, history, text, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, instructions, input: [...history, { role: 'user', content: text }], max_output_tokens: 1200, store: false }),
  });
  if (!response.ok) {
    // Do not log provider response bodies: they may contain user content.
    const error = new Error('OpenAI request failed');
    error.status = response.status;
    throw error;
  }
  const result = await response.json();
  if (result.status === 'incomplete') throw new Error('Incomplete model response');
  const reply = extractText(result);
  if (!reply) throw new Error('Empty model response');
  return reply;
}

export function splitReply(text, limit = 1900) {
  const chunks = [];
  let chunk = '';
  for (const char of text) {
    if (chunk.length + char.length > limit) { chunks.push(chunk); chunk = ''; }
    chunk += char;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}
