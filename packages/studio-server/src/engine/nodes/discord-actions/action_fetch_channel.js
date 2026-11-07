export default {
  description: 'Fetches a channel and exposes its name, type, topic, slowmode, parent, and full object.',
  type: 'action_fetch_channel',
  category: 'Discord Actions',
  label: 'Get Channel Info',
  color: '#10b981',
  defaultData: {
    channel_id: ''
  },
  editorControls: [
    { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: 'Channel ID' }
  ],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel', label: 'Channel Object', type: 'object' },
    { id: 'channel_id_out', label: 'Channel ID', type: 'string' },
    { id: 'channel_id', label: 'Channel ID', type: 'string' },
    { id: 'name', label: 'Name', type: 'string' },
    { id: 'type', label: 'Channel Type', type: 'number' },
    { id: 'guild_id', label: 'Server ID', type: 'string' },
    { id: 'parent_id', label: 'Parent ID', type: 'string' },
    { id: 'category_id', label: 'Category ID', type: 'string' },
    { id: 'position', label: 'Position', type: 'number' },
    { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object' },
    { id: 'overwrite_count', label: 'Overwrite Count', type: 'number' },
    { id: 'topic', label: 'Topic', type: 'string' },
    { id: 'nsfw', label: 'Age Restricted', type: 'boolean' },
    { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: 'number' },
    { id: 'bitrate', label: 'Voice Bitrate', type: 'number' },
    { id: 'user_limit', label: 'Voice User Limit', type: 'number' },
    { id: 'rtc_region', label: 'Voice Region', type: 'string' },
    { id: 'video_quality_mode', label: 'Voice Video Quality Mode', type: 'number' },
    { id: 'default_auto_archive_duration', label: 'Default Thread Archive (minutes)', type: 'number' },
    { id: 'default_thread_rate_limit_per_user', label: 'Thread Slowmode', type: 'number' },
    { id: 'available_tags', label: 'Forum Tags', type: 'object' },
    { id: 'last_message_id', label: 'Last Message ID', type: 'string' },
    { id: 'flags', label: 'Channel Flags', type: 'number' },
    { id: 'archived', label: 'Archived', type: 'boolean' },
    { id: 'locked', label: 'Locked', type: 'boolean' },
    { id: 'invitable', label: 'Members Can Invite', type: 'boolean' },
    { id: 'auto_archive_duration', label: 'Thread Auto Archive (minutes)', type: 'number' },
    { id: 'message_count', label: 'Message Count', type: 'number' },
    { id: 'member_count', label: 'Member Count', type: 'number' },
    { id: 'obfuscated', label: 'Metadata Obfuscated', type: 'boolean' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
