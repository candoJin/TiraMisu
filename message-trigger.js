export function humanMessagePrompt(message, botId) {
  if (message.author?.bot || message.author?.id === botId || message.webhookId) return null;
  const content = typeof message.content === 'string' ? message.content : '';
  if (!message.guildId) return content.trim() ? { source: 'dm', text: content.trim() } : null;
  if (!content || !message.mentions?.users?.has(botId)) return null;
  const text = content.replace(new RegExp(`<@!?${botId}>`, 'g'), '').trim();
  return { source: 'mention', text: text || '안녕. 불렀어.' };
}
