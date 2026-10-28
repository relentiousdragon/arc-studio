export default {
  description: 'Fetches up to 100 recent messages from a channel. Requires View Channel and Read Message History.',
  type: 'action_fetch_channel_messages',
  category: 'Discord Actions',
  label: 'Get Channel Messages',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'limit', label: 'Limit', type: 'number', defaultValue: 50 },
    { id: 'before', label: 'Before Message ID', type: 'string', defaultValue: '' },
    { id: 'after', label: 'After Message ID', type: 'string', defaultValue: '' },
    { id: 'around', label: 'Around Message ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'messages', label: 'Messages', type: 'array' },
    { id: 'count', label: 'Count', type: 'number' },
    { id: 'first_message', label: 'First Message', type: 'object' },
    { id: 'last_message', label: 'Last Message', type: 'object' }
  ]
};
