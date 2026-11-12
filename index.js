import { readFileSync } from 'node:fs';
import { Client, Events, GatewayIntentBits, MessageFlags, Options, SlashCommandBuilder } from 'discord.js';
import { generateReply, splitReply } from './chat.js';

const required = ['DISCORD_TOKEN', 'OPENAI_API_KEY'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) { console.error(`Missing environment variables: ${missing.join(', ')}`); process.exit(1); }
const model = process.env.OPENAI_MODEL?.trim() || 'gpt-6-luna';
const instructions = readFileSync(new URL('./persona.txt', import.meta.url), 'utf8');
const sessions = new Map();
const busy = new Set();
const cooldown = new Map();
const ttl = 30 * 60_000;
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({ ...Options.DefaultMakeCacheSettings, MessageManager: 0 }),
  allowedMentions: { parse: [], repliedUser: false },
});
const commands = [
  new SlashCommandBuilder().setName('대화').setDescription('마누카와 이야기해요. 입력한 내용은 OpenAI API로 전송돼요.')
    .addStringOption(option => option.setName('내용').setDescription('하고 싶은 말').setRequired(true).setMaxLength(2000)),
  new SlashCommandBuilder().setName('초기화').setDescription('이 채널에서 내 대화 기억을 지워요.'),
  new SlashCommandBuilder().setName('상태').setDescription('봇 상태와 사용법을 확인해요.'),
];
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, value] of sessions) if (now - value.updated > ttl) sessions.delete(key);
  for (const [key, value] of cooldown) if (now - value > 5000) cooldown.delete(key);
}, 60_000);
sweep.unref();

client.once(Events.ClientReady, async ready => {
  console.log(`Discord ready: ${ready.user.tag}; model=${model}`);
  try {
    // Upsert only this bot's commands; preserve unrelated commands.
    for (const command of commands) await ready.application.commands.create(command);
    console.log('Slash commands registered: 대화, 초기화, 상태');
  } catch { console.error('Slash command registration failed'); process.exitCode = 1; client.destroy(); }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (!['대화', '초기화', '상태'].includes(interaction.commandName)) return;
  const key = `${interaction.guildId ?? 'dm'}:${interaction.channelId}:${interaction.user.id}`;
  const privateReply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  try {
    if (interaction.commandName === '상태') {
      await privateReply(`응, 접속 중이야. 모델: ${model}\n/대화 내용: 으로 말해줘. /초기화 로 이 채널의 네 대화 기억을 지울 수 있어.\n대화는 OpenAI API로 전송돼. 기억은 사용자·채널별로 분리하고, 30분 동안 사용하지 않거나 재시작하면 사라져.`);
      return;
    }
    if (busy.has(key)) { await privateReply('잠깐만. 앞의 대답을 마무리하고 있어.'); return; }
    if (interaction.commandName === '초기화') {
      sessions.delete(key);
      await privateReply('응. 이 채널에서 나눈 네 대화 기억은 지웠어.');
      return;
    }
    if (busy.size >= 3) { await privateReply('지금은 대화가 조금 몰렸어. 잠깐 뒤에 다시 말해줘.'); return; }
    if (Date.now() - (cooldown.get(key) ?? 0) < 5000) { await privateReply('조금만 천천히 말해줘.'); return; }
    const text = interaction.options.getString('내용', true).trim();
    if (!text) { await privateReply('내용을 적어줘.'); return; }
    busy.add(key);
    cooldown.set(key, Date.now());
    try {
      await interaction.deferReply();
      const saved = sessions.get(key);
      const history = saved && Date.now() - saved.updated < ttl ? saved.history : [];
      const reply = await generateReply({ apiKey: process.env.OPENAI_API_KEY, model, instructions, history, text });
      const chunks = splitReply(reply);
      await interaction.editReply({ content: chunks[0], allowedMentions: { parse: [] } });
      for (const content of chunks.slice(1)) await interaction.followUp({ content, allowedMentions: { parse: [] } });
      if (!sessions.has(key) && sessions.size >= 500) sessions.delete(sessions.keys().next().value);
      sessions.set(key, { updated: Date.now(), history: [...history, { role: 'user', content: text }, { role: 'assistant', content: reply.slice(0, 6000) }].slice(-12) });
    } finally { busy.delete(key); }
  } catch (error) {
    console.error(`Interaction failed: status=${Number(error.status) || 'unknown'}; type=${error.name}`);
    const content = '지금 답변을 가져오지 못했어. 잠깐 뒤에 다시 말해줘.';
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content });
      else await privateReply(content);
    } catch { console.error('Could not deliver interaction error response'); }
  }
});
client.on(Events.Error, () => console.error('Discord client error'));
client.on(Events.ShardReconnecting, () => console.log('Discord reconnecting'));
client.on(Events.ShardResume, () => console.log('Discord connection resumed'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { client.destroy(); process.exit(0); });
process.on('unhandledRejection', () => { console.error('Unhandled rejection; stopping for supervisor restart'); client.destroy(); process.exit(1); });
client.login(process.env.DISCORD_TOKEN).catch(() => { console.error('Discord login failed; check token and network'); process.exit(1); });
