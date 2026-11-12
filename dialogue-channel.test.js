import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { resolveDialogueChannel, resolveDialoguePartner } from './dialogue-channel.js';

const permissions = (...bits) => new PermissionsBitField(bits);
function setup({ cached = false, thread = false, allowed = true } = {}) {
  const channel = { id: 'channel', guildId: 'guild', isTextBased: () => true, isThread: () => thread,
    send: async () => {}, permissionsFor: () => permissions(PermissionFlagsBits.ViewChannel,
      ...(allowed ? [thread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages] : [])) };
  let fetched = 0;
  const interaction = { guildId: 'guild', channelId: 'channel', channel: cached ? channel : null,
    client: { user: {}, channels: { fetch: async (id, options) => { fetched++; assert.equal(id, 'channel'); assert.equal(options.force, true); return channel; } } } };
  return { interaction, channel, fetched: () => fetched };
}

test('Uncached server interaction resolves its channel instead of treating it as a DM', async () => {
  const t = setup();
  assert.equal(await resolveDialogueChannel(t.interaction), t.channel);
  assert.equal(t.fetched(), 1);
});

test('Cached server channels and permitted threads can send without refetching', async () => {
  for (const thread of [false, true]) {
    const t = setup({ cached: true, thread });
    assert.equal(await resolveDialogueChannel(t.interaction), t.channel);
    assert.equal(t.fetched(), 0);
  }
});

test('Actual DM, missing send permission and cross-server channels are distinguished', async () => {
  const dm = setup(); dm.interaction.guildId = null;
  await assert.rejects(resolveDialogueChannel(dm.interaction), error => error.code === 'GUILD_ONLY');
  assert.equal(dm.fetched(), 0);
  const denied = setup({ allowed: false });
  await assert.rejects(resolveDialogueChannel(denied.interaction), error => error.code === 'SEND_PERMISSION');
  const wrong = setup(); wrong.channel.guildId = 'another-guild';
  await assert.rejects(resolveDialogueChannel(wrong.interaction), error => error.code === 'CHANNEL_ACCESS');
});

test('Discord access, deleted-channel and network errors produce separate guidance', async () => {
  for (const [providerCode, expected] of [[50001, 'CHANNEL_ACCESS'], [50013, 'CHANNEL_ACCESS'], [10003, 'UNKNOWN_CHANNEL'], ['ENOTFOUND', 'CHANNEL_FETCH']]) {
    const t = setup();
    t.interaction.client.channels.fetch = async () => { const e = new Error('redacted'); e.code = providerCode; throw e; };
    await assert.rejects(resolveDialogueChannel(t.interaction), error => error.code === expected && !error.publicMessage.includes('redacted'));
  }
});

test('Locked archived threads are rejected before paid generation', async () => {
  const t = setup({ thread: true });
  t.channel.archived = true; t.channel.locked = true;
  await assert.rejects(resolveDialogueChannel(t.interaction), error => error.code === 'LOCKED_THREAD');
});

test('Partner must be a server member with channel access before paid generation', async () => {
  const t = setup();
  const user = { id: 'rime', bot: true };
  t.channel.guild = { members: { fetch: async id => { assert.equal(id, 'rime'); return { user }; } } };
  assert.equal(await resolveDialoguePartner(t.channel, 'rime'), user);
  t.channel.guild.members.fetch = async () => { const e = new Error('unknown member'); e.code = 10007; throw e; };
  await assert.rejects(resolveDialoguePartner(t.channel, 'rime'), error => error.code === 'PARTNER_NOT_IN_GUILD');
  t.channel.guild.members.fetch = async () => ({ user });
  t.channel.permissionsFor = () => permissions(PermissionFlagsBits.ViewChannel);
  await assert.rejects(resolveDialoguePartner(t.channel, 'rime'), error => error.code === 'PARTNER_PERMISSION');
});
