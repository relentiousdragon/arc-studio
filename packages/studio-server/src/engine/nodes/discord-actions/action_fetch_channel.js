export default {
  description: 'Fetches a channel and exposes its name, type, topic, parent, and full object.',
  type: 'action_fetch_channel',
  category: 'Discord Actions',
  label: 'Get Channel Info',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel', label: 'Channel Object', type: 'object' },
    { id: 'channel_id_out', label: 'Channel ID', type: 'string' },
    { id: 'name', label: 'Name', type: 'string' },
    { id: 'type', label: 'Channel Type', type: 'number' },
    { id: 'guild_id', label: 'Server ID', type: 'string' },
    { id: 'parent_id', label: 'Parent ID', type: 'string' },
    { id: 'topic', label: 'Topic', type: 'string' },
    { id: 'nsfw', label: 'Age Restricted', type: 'boolean' },
    { id: 'last_message_id', label: 'Last Message ID', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
