export function extractText(response) {
  return (response.output ?? []).flatMap(item => item.type === 'message' ? item.content ?? [] : [])
    .filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim();
}

export async function generateReply({ apiKey, model, instructions, history, text, maxOutputTokens = 1200, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ model, instructions, input: [...history, { role: 'user', content: text }], reasoning: { effort: 'none' }, max_output_tokens: maxOutputTokens, store: false }),
  });
  if (!response.ok) {
    // Keep only documented machine codes; never expose provider messages or bodies.
    const body = await response.json().catch(() => null);
    const allowedCodes = ['invalid_api_key', 'insufficient_quota', 'credit_balance_exhausted',
      'organization_spend_limit_exceeded', 'project_spend_limit_exceeded',
      'organization_usage_limit_exceeded', 'rate_limit_exceeded', 'slow_down', 'model_not_found'];
    const error = new Error('OpenAI request failed');
    error.status = response.status;
    error.provider = 'openai';
    error.code = allowedCodes.includes(body?.error?.code) ? body.error.code : 'unknown';
    if (error.code === 'unknown' && body?.error?.type === 'insufficient_quota') error.code = 'insufficient_quota';
    throw error;
  }
  const result = await response.json();
  if (result.status === 'incomplete') throw new Error('Incomplete model response');
  const reply = extractText(result);
  if (!reply) throw new Error('Empty model response');
  return reply;
}

export function errorReply(error) {
  if (error.provider !== 'openai') return '지금 답변을 가져오지 못했어. 잠깐 뒤에 다시 말해줘.';
  if (error.status === 401) return 'AI 연결 키 인증에 실패했어. 관리자에게 OPENAI_API_KEY 확인을 부탁해줘.';
  if (['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded',
    'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(error.code)) {
    return '지금 AI API의 잔액 또는 사용 한도에 막혀 있어. 관리자가 OpenAI 결제·사용 한도를 확인해야 해.';
  }
  if (error.status === 429) return '지금 AI 요청이 제한되고 있어. 잠시 뒤에 다시 말해줘. 계속되면 관리자에게 API 한도 확인을 부탁해줘.';
  if (error.code === 'model_not_found' || error.status === 403) return '설정된 AI 모델에 접근하지 못했어. 관리자에게 모델 사용 권한 확인을 부탁해줘.';
  return '지금 AI 응답을 가져오지 못했어. 잠깐 뒤에 다시 말해줘.';
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
