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
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Channel Info."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel to retrieve."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Channel Info completes."},
    { id: 'channel', label: 'Channel Object', type: 'object', description: "Full channel record returned by Discord."},
    { id: 'channel_id_out', label: 'Channel ID', type: 'string', description: "ID of the returned channel."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel to retrieve."},
    { id: 'name', label: 'Name', type: 'string', description: "Name to assign."},
    { id: 'type', label: 'Channel Type', type: 'number', description: "Discord channel type value."},
    { id: 'guild_id', label: 'Server ID', type: 'string', description: "ID of the server containing the channel."},
    { id: 'parent_id', label: 'Parent ID', type: 'string', description: "ID of the parent channel or category."},
    { id: 'category_id', label: 'Category ID', type: 'string', description: "ID of the channel category."},
    { id: 'position', label: 'Position', type: 'number', description: "Position of the channel in its list."},
    { id: 'permission_overwrites', label: 'Permission Overwrites', type: 'object', description: "Permission overwrites configured for the channel."},
    { id: 'overwrite_count', label: 'Overwrite Count', type: 'number', description: "Number of permission overwrites."},
    { id: 'topic', label: 'Topic', type: 'string', description: "Current channel topic."},
    { id: 'nsfw', label: 'Age Restricted', type: 'boolean', description: "Whether the channel is age restricted."},
    { id: 'rate_limit_per_user', label: 'Slowmode (seconds)', type: 'number', description: "Channel slowmode delay in seconds."},
    { id: 'bitrate', label: 'Voice Bitrate', type: 'number', description: "Voice channel bitrate in bits per second."},
    { id: 'user_limit', label: 'Voice User Limit', type: 'number', description: "Maximum number of users allowed in the voice channel."},
    { id: 'rtc_region', label: 'Voice Region', type: 'string', description: "Voice region assigned to the channel."},
    { id: 'video_quality_mode', label: 'Voice Video Quality Mode', type: 'number', description: "Voice video quality mode value."},
    { id: 'default_auto_archive_duration', label: 'Default Thread Archive (minutes)', type: 'number', description: "Default thread auto archive time in minutes."},
    { id: 'default_thread_rate_limit_per_user', label: 'Thread Slowmode', type: 'number', description: "Default thread slowmode in seconds."},
    { id: 'available_tags', label: 'Forum Tags', type: 'object', description: "Forum tags available in the channel."},
    { id: 'last_message_id', label: 'Last Message ID', type: 'string', description: "ID of the latest message in the channel."},
    { id: 'flags', label: 'Channel Flags', type: 'number', description: "Discord flags value."},
    { id: 'archived', label: 'Archived', type: 'boolean', description: "Whether the thread is archived."},
    { id: 'locked', label: 'Locked', type: 'boolean', description: "Whether the thread is locked."},
    { id: 'invitable', label: 'Members Can Invite', type: 'boolean', description: "Whether members can invite others to the thread."},
    { id: 'auto_archive_duration', label: 'Thread Auto Archive (minutes)', type: 'number', description: "Thread auto archive time in minutes."},
    { id: 'message_count', label: 'Message Count', type: 'number', description: "Number of messages in the thread."},
    { id: 'member_count', label: 'Member Count', type: 'number', description: "Approximate number of server members."},
    { id: 'obfuscated', label: 'Metadata Obfuscated', type: 'boolean', description: "Whether Discord hid some channel metadata."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
