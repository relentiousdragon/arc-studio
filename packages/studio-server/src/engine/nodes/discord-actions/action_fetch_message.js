export default {
  description: 'Fetches one message by channel and message ID. Requires View Channel and Read Message History.',
  type: 'action_fetch_message',
  category: 'Discord Actions',
  label: 'Get Message',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Message."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel containing the message."},
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '', description: "ID of the message to fetch."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Message completes."},
    { id: 'message', label: 'Message Object', type: 'object', description: "Full message record returned by Discord."},
    { id: 'message_id_out', label: 'Message ID', type: 'string', description: "ID of the fetched message."},
    { id: 'channel_id_out', label: 'Channel ID', type: 'string', description: "ID of the returned channel."},
    { id: 'content', label: 'Content', type: 'string', description: "Text content of the message."},
    { id: 'author_id', label: 'Author ID', type: 'string', description: "ID of the message author."},
    { id: 'timestamp', label: 'Timestamp', type: 'string', description: "Time the message was created."},
    { id: 'edited_timestamp', label: 'Edited At', type: 'string', description: "Time the message was last edited."},
    { id: 'attachments', label: 'Attachments', type: 'array', description: "Files attached to the message."},
    { id: 'embeds', label: 'Embeds', type: 'array', description: "Embeds included in the message."},
    { id: 'components', label: 'Components', type: 'array', description: "Components included in the message."},
    { id: 'pinned', label: 'Pinned', type: 'boolean', description: "Whether the message is pinned."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
