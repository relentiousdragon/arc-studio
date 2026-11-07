export default {
  description: 'Creates a text, voice, category, announcement, stage, forum, or media channel. Requires Manage Channels.',
  type: 'action_create_channel',
  category: 'Discord Actions',
  label: 'Create Channel',
  color: '#10b981',
  defaultData: {
    channel_type: 0
  },
  editorControls: [
    {
      type: 'select',
      key: 'channel_type',
      inputId: 'channel_type',
      label: 'Channel Type',
      defaultValue: 0,
      valueType: 'number',
      options: [
        { value: 0, label: 'Text' },
        { value: 2, label: 'Voice' },
        { value: 4, label: 'Category' },
        { value: 5, label: 'Announcement' },
        { value: 13, label: 'Stage' },
        { value: 15, label: 'Forum' },
        { value: 16, label: 'Media' }
      ]
    }
  ],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'name', label: 'Name', type: 'string', defaultValue: '' },
    { id: 'channel_type', label: 'Channel Type', type: 'number', defaultValue: 0 },
    { id: 'category_id', label: 'Category ID', type: 'string', defaultValue: '' },
    { id: 'parent_id', label: 'Parent ID', type: 'string', defaultValue: '' },
    { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object', defaultValue: [] },
    { id: 'topic', label: 'Topic', type: 'string', defaultValue: '' },
    { id: 'flags', label: 'Channel Flags', type: 'number', defaultValue: 0 },
    { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: 'number', defaultValue: 0 },
    { id: 'bitrate', label: 'Bitrate (bits/sec)', type: 'number', defaultValue: 64000 },
    { id: 'user_limit', label: 'User Limit', type: 'number', defaultValue: 0 },
    { id: 'position', label: 'Position', type: 'number', defaultValue: 0 },
    { id: 'rtc_region', label: 'Voice Region', type: 'string', defaultValue: '' },
    { id: 'video_quality_mode', label: 'Voice Video Quality Mode', type: 'number', defaultValue: 1 },
    { id: 'default_auto_archive_duration', label: 'Default Thread Archive (minutes)', type: 'number', defaultValue: 1440 },
    { id: 'default_thread_rate_limit_per_user', label: 'Thread Slowmode (seconds)', type: 'number', defaultValue: 0 },
    { id: 'available_tags', label: 'Forum Tags', type: 'object', defaultValue: [] },
    { id: 'nsfw', label: 'Age Restricted', type: 'boolean', defaultValue: false },
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel', label: 'Channel Object', type: 'object' },
    { id: 'channel_id', label: 'Channel ID', type: 'string' },
    { id: 'channel_id_out', label: 'Channel ID', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
