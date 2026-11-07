export const DISCORD_PERMISSION_GROUPS = [
  { id: 'general', label: 'General', permissions: [
    ['CreateInstantInvite', 'Create Invite', 0, 'T,V,S'], ['KickMembers', 'Kick Members', 1], ['BanMembers', 'Ban Members', 2], ['Administrator', 'Administrator', 3], ['ManageChannels', 'Manage Channels', 4, 'T,V,S'], ['ManageGuild', 'Manage Server', 5], ['ViewAuditLog', 'View Audit Log', 7], ['ManageRoles', 'Manage Roles', 28, 'T,V,S'], ['ManageWebhooks', 'Manage Webhooks', 29, 'T,V,S'], ['ManageGuildExpressions', 'Manage Expressions', 30], ['CreateGuildExpressions', 'Create Expressions', 43], ['ViewGuildInsights', 'View Server Insights', 19], ['ManageEvents', 'Manage Events', 33, 'V,S'], ['CreateEvents', 'Create Events', 44, 'V,S'], ['ViewCreatorMonetizationAnalytics', 'View Creator Monetization Analytics', 41], ['ModerateMembers', 'Moderate Members', 40], ['ChangeNickname', 'Change Own Nickname', 26], ['ManageNicknames', 'Manage Nicknames', 27]
  ] },
  { id: 'text', label: 'Text', permissions: [
    ['ViewChannel', 'View Channel', 10, 'T,V,S'], ['SendMessages', 'Send Messages', 11, 'T,V,S'], ['SendTTSMessages', 'Send TTS Messages', 12, 'T,V,S'], ['ManageMessages', 'Manage Messages', 13, 'T,V,S'], ['EmbedLinks', 'Embed Links', 14, 'T,V,S'], ['AttachFiles', 'Attach Files', 15, 'T,V,S'], ['ReadMessageHistory', 'Read Message History', 16, 'T,V,S'], ['MentionEveryone', 'Mention @everyone and @here', 17, 'T,V,S'], ['UseExternalEmojis', 'Use External Emoji', 18, 'T,V,S'], ['UseApplicationCommands', 'Use App Commands', 31, 'T,V,S'], ['CreatePublicThreads', 'Create Public Threads', 35, 'T'], ['CreatePrivateThreads', 'Create Private Threads', 36, 'T'], ['ManageThreads', 'Manage Threads', 34, 'T'], ['UseExternalStickers', 'Use External Stickers', 37, 'T,V,S'], ['SendMessagesInThreads', 'Send Messages in Threads', 38, 'T'], ['SendVoiceMessages', 'Send Voice Messages', 46, 'T,V,S'], ['SendPolls', 'Create Polls', 49, 'T,V,S'], ['UseExternalApps', 'Use External Apps', 50, 'T,V,S'], ['PinMessages', 'Pin Messages', 51, 'T'], ['BypassSlowmode', 'Bypass Slowmode', 52, 'T,V,S'], ['AddReactions', 'Add Reactions', 6, 'T,V,S']
  ] },
  { id: 'voice', label: 'Voice', permissions: [
    ['PrioritySpeaker', 'Priority Speaker', 8, 'V'], ['Stream', 'Video and Screen Share', 9, 'V,S'], ['Connect', 'Connect', 20, 'V,S'], ['Speak', 'Speak', 21, 'V'], ['MuteMembers', 'Mute Members', 22, 'V,S'], ['DeafenMembers', 'Deafen Members', 23, 'V'], ['MoveMembers', 'Move Members', 24, 'V,S'], ['UseVAD', 'Use Voice Activity', 25, 'V'], ['RequestToSpeak', 'Request to Speak', 32, 'S'], ['UseEmbeddedActivities', 'Use Activities', 39, 'T,V'], ['UseSoundboard', 'Use Soundboard', 42, 'V'], ['UseExternalSounds', 'Use External Sounds', 45, 'V'], ['SetVoiceChannelStatus', 'Set Voice Channel Status', 48, 'V']
  ] }
];

export const DISCORD_PERMISSIONS = DISCORD_PERMISSION_GROUPS.flatMap((group) => group.permissions.map(([key, label, bit, contexts]) => ({ key, label, bit, contexts: contexts?.split(',') || [] })));

export function permissionsToBitfield(permissions) {
  const selected = new Set(Array.isArray(permissions) ? permissions.map(String) : []);
  return DISCORD_PERMISSIONS.reduce((bits, permission) => {
    const screaming = permission.key.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '');
    if (selected.has(permission.key) || selected.has(screaming) || selected.has(permission.label)) {
      return bits | (1n << BigInt(permission.bit));
    }
    return bits;
  }, 0n).toString();
}

export function bitfieldToPermissions(value) {
  let bits = 0n;
  try { bits = BigInt(String(value || '0')); } catch {}
  return DISCORD_PERMISSIONS.filter((permission) => (bits & (1n << BigInt(permission.bit))) !== 0n).map((permission) => permission.key);
}

export function normalizePermissionNames(value) {
  if (Array.isArray(value)) return value;
  return bitfieldToPermissions(value);
}
