export default {
  description: 'Fetches up to 100 recent messages from a channel. Requires View Channel and Read Message History.',
  type: 'action_fetch_channel_messages',
  category: 'Discord Actions',
  label: 'Get Channel Messages',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Channel Messages."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel to fetch messages from."},
    { id: 'limit', label: 'Limit', type: 'number', defaultValue: 50, description: "Maximum number of messages to fetch."},
    { id: 'before', label: 'Before Message ID', type: 'string', defaultValue: '', description: "Fetch messages older than this message ID."},
    { id: 'after', label: 'After Message ID', type: 'string', defaultValue: '', description: "Fetch messages newer than this message ID."},
    { id: 'around', label: 'Around Message ID', type: 'string', defaultValue: '', description: "Fetch messages around this message ID."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Channel Messages completes."},
    { id: 'messages', label: 'Messages', type: 'array', description: "Messages fetched from the channel."},
    { id: 'count', label: 'Count', type: 'number', description: "Number of messages returned."},
    { id: 'first_message', label: 'First Message', type: 'object', description: "Oldest message in the returned results."},
    { id: 'last_message', label: 'Last Message', type: 'object', description: "Newest message in the returned results."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
