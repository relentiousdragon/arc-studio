export default {
  description: 'Fires for every new message. Server ID is empty in direct messages. Use Split Text to break message content into parts.',
  type: 'event_message_create',
  dynamicPins: { kind: 'connected-output-arguments', prefix: 'argument_', label: 'Legacy Argument {index}', type: 'string', max: 50 },
  category: 'Events',
  label: 'On Message Create',
  color: '#5865F2',
  gatewayEvent: 'MESSAGE_CREATE',
  gatewayIntents: [
    'GUILDS',
    'GUILD_MESSAGES',
    'DIRECT_MESSAGES',
    'MESSAGE_CONTENT'
  ],
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs for every new message."},
    { id: 'message', label: 'Message Object', type: 'object', eventPath: '$', description: "The new Discord message."},
    { id: 'message_id', label: 'Message ID', type: 'string', eventPath: 'id', description: "ID of the message tied to this event."},
    { id: 'content', label: 'Message Content', type: 'string', description: "Text content of the message."},
    { id: 'author_id', label: 'Author ID', type: 'string', description: "ID of the message author."},
    { id: 'author_name', label: 'Author Name', type: 'string', description: "Username of the message author."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel where the event occurred."},
    { id: 'thread_id', label: 'Thread ID', type: 'string', description: "ID of the thread where the event occurred."},
    { id: 'guild_id', label: 'Server ID', type: 'string', eventPath: 'guild_id', description: "ID of the server where the event occurred."},
    { id: 'is_bot', label: 'Is Bot', type: 'boolean', description: "Whether the message author is a bot."},
    { id: 'has_mentions', label: 'Has Mentions', type: 'boolean', description: "Whether the message mentions any users."},
    { id: 'mentions', label: 'Mentioned Users', type: 'object', eventPath: 'mentions', description: "Users mentioned in the message."},
    { id: 'mention_roles', label: 'Mentioned Roles', type: 'object', eventPath: 'mention_roles', description: "Roles mentioned in the message."},
    { id: 'mention_everyone', label: 'Mentions Everyone', type: 'boolean', eventPath: 'mention_everyone', description: "Whether the message mentions everyone."},
    { id: 'is_reply', label: 'Is Reply', type: 'boolean', description: "Whether the message replies to another message."},
    { id: 'referenced_message_id', label: 'Replied Message ID', type: 'string', eventPath: 'message_reference.message_id', description: "ID of the message being replied to."},
    { id: 'reply_author_id', label: 'Replied Author ID', type: 'string', eventPath: 'referenced_message.author.id', description: "ID of the author of the replied message."}
  ]
};
