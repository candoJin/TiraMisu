import { PermissionFlagsBits } from 'discord.js';

export class DialogueChannelError extends Error {
  constructor(code, publicMessage) { super(code); this.code = code; this.publicMessage = publicMessage; }
}

export async function resolveDialogueChannel(interaction) {
  if (!interaction.guildId) throw new DialogueChannelError('GUILD_ONLY', '봇 대화는 DM이 아닌 Discord 서버 채널에서 시작해줘. 티라미슈와 리메가 그 서버에 모두 있어야 해.');
  let channel = interaction.channel;
  if (!channel) {
    try { channel = await interaction.client.channels.fetch(interaction.channelId, { force: true }); }
    catch (error) {
      if (error.code === 10003) throw new DialogueChannelError('UNKNOWN_CHANNEL', '채널을 찾을 수 없어. 서버의 다른 텍스트 채널에서 다시 실행해줘.');
      if (error.code === 50001 || error.code === 50013) throw new DialogueChannelError('CHANNEL_ACCESS', '티라미슈가 이 채널에 접근하지 못해. 서버에 봇을 초대하고 채널 보기·메시지 보내기 권한을 확인해줘.');
      throw new DialogueChannelError('CHANNEL_FETCH', '서버 채널 정보를 가져오지 못했어. 잠깐 뒤에 다시 실행해줘.');
    }
  }
  if (!channel || channel.guildId !== interaction.guildId) throw new DialogueChannelError('CHANNEL_ACCESS', '티라미슈가 이 서버 채널을 확인하지 못해. 서버에 봇이 초대되어 있고 채널 보기 권한이 있는지 확인해줘.');
  if (!channel.isTextBased?.() || typeof channel.send !== 'function') throw new DialogueChannelError('NOT_SENDABLE', '메시지를 보낼 수 있는 서버 채널에서 실행해줘. 게시판이라면 글 안의 채널에서 실행하면 돼.');
  const permissions = channel.permissionsFor?.(interaction.client.user) ?? interaction.appPermissions;
  const sendPermission = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(sendPermission)) {
    throw new DialogueChannelError('SEND_PERMISSION', '티라미슈에 이 채널의 채널 보기·메시지 보내기 권한이 필요해. 스레드라면 스레드에서 메시지 보내기도 허용해줘.');
  }
  if (channel.isThread?.() && channel.archived && channel.locked && !permissions.has(PermissionFlagsBits.ManageThreads)) {
    throw new DialogueChannelError('LOCKED_THREAD', '이 스레드는 보관·잠금 상태라 메시지를 보낼 수 없어. 스레드 잠금을 풀거나 다른 서버 채널에서 실행해줘.');
  }
  return channel;
}

export async function resolveDialoguePartner(channel, partnerId) {
  let member;
  try { member = await channel.guild.members.fetch(partnerId); }
  catch (error) {
    if (error.code === 10007) throw new DialogueChannelError('PARTNER_NOT_IN_GUILD', '리메가 이 서버에 없어. 같은 서버에 리메를 초대한 뒤 실행해줘.');
    throw new DialogueChannelError('PARTNER_LOOKUP', '이 서버에서 리메를 확인하지 못했어. 두 봇의 서버 참여와 채널 접근 권한을 확인해줘.');
  }
  const permissions = channel.permissionsFor(member);
  const sendPermission = channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(sendPermission)) {
    throw new DialogueChannelError('PARTNER_PERMISSION', '리메가 이 채널을 보거나 메시지를 보낼 수 없어. 리메의 채널 권한도 확인해줘.');
  }
  return member.user;
}
