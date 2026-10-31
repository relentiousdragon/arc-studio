export default {
  description: 'Fetches one message by channel and message ID. Requires View Channel and Read Message History.',
  type: 'action_fetch_message',
  category: 'Discord Actions',
  label: 'Get Message',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'message', label: 'Message Object', type: 'object' },
    { id: 'message_id_out', label: 'Message ID', type: 'string' },
    { id: 'channel_id_out', label: 'Channel ID', type: 'string' },
    { id: 'content', label: 'Content', type: 'string' },
    { id: 'author_id', label: 'Author ID', type: 'string' },
    { id: 'timestamp', label: 'Timestamp', type: 'string' },
    { id: 'edited_timestamp', label: 'Edited At', type: 'string' },
    { id: 'attachments', label: 'Attachments', type: 'array' },
    { id: 'embeds', label: 'Embeds', type: 'array' },
    { id: 'components', label: 'Components', type: 'array' },
    { id: 'pinned', label: 'Pinned', type: 'boolean' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
