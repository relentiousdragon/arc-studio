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
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Create Channel."},
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server where the channel will be created."},
    { id: 'name', label: 'Name', type: 'string', defaultValue: '', description: "Name to assign."},
    { id: 'channel_type', label: 'Channel Type', type: 'number', defaultValue: 0, description: "Discord channel type value."},
    { id: 'category_id', label: 'Category ID', type: 'string', defaultValue: '', description: "Category ID alias for the parent channel."},
    { id: 'parent_id', label: 'Parent ID', type: 'string', defaultValue: '', description: "Optional parent channel or category ID."},
    { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object', defaultValue: [], description: "Channel permission overwrites to apply."},
    { id: 'topic', label: 'Topic', type: 'string', defaultValue: '', description: "Channel topic to set."},
    { id: 'flags', label: 'Channel Flags', type: 'number', defaultValue: 0, description: "Channel flags to set."},
    { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: 'number', defaultValue: 0, description: "Slowmode delay in seconds."},
    { id: 'bitrate', label: 'Bitrate (bits/sec)', type: 'number', defaultValue: 64000, description: "Voice channel bitrate in bits per second."},
    { id: 'user_limit', label: 'User Limit', type: 'number', defaultValue: 0, description: "Maximum number of users allowed in the voice channel."},
    { id: 'position', label: 'Position', type: 'number', defaultValue: 0, description: "Position of the new channel in the channel list."},
    { id: 'rtc_region', label: 'Voice Region', type: 'string', defaultValue: '', description: "Voice region for the new channel, or blank for automatic selection."},
    { id: 'video_quality_mode', label: 'Voice Video Quality Mode', type: 'number', defaultValue: 1, description: "Voice video quality mode value."},
    { id: 'default_auto_archive_duration', label: 'Default Thread Archive (minutes)', type: 'number', defaultValue: 1440, description: "Default thread auto archive time in minutes."},
    { id: 'default_thread_rate_limit_per_user', label: 'Thread Slowmode (seconds)', type: 'number', defaultValue: 0, description: "Default thread slowmode in seconds."},
    { id: 'available_tags', label: 'Forum Tags', type: 'object', defaultValue: [], description: "Forum tags to make available."},
    { id: 'nsfw', label: 'Age Restricted', type: 'boolean', defaultValue: false, description: "Whether to mark the channel as age restricted."},
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '', description: "Reason recorded in the audit log."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Create Channel completes."},
    { id: 'channel', label: 'Channel Object', type: 'object', description: "New channel record returned by Discord."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the created channel."},
    { id: 'channel_id_out', label: 'Channel ID', type: 'string', description: "ID of the returned channel."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
