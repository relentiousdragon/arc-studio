export default {
  description: 'Fires when an app message context menu command is invoked on a message',
  type: 'event_message_command',
  category: 'Events',
  label: 'On Message Command',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayInteractionType: 2,
  gatewayCommandType: 3,
  createdAt: '2026-11-07T13:30:00.000Z',
  defaultData: {
    commandName: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when an app message context menu command is invoked on a message."},
    { id: 'command_name', label: 'Command Name', type: 'string', description: "Name of the invoked application command."},
    { id: 'target_message_id', label: 'Target Message ID', type: 'string', description: "ID of the message selected by the command."},
    { id: 'target_message', label: 'Target Message', type: 'object', description: "Message selected by the command."},
    { id: 'target_message_content', label: 'Target Message Content', type: 'string', description: "Text content of the selected message."},
    { id: 'target_author_id', label: 'Target Author ID', type: 'string', description: "ID of the selected message author."},
    { id: 'user_id', label: 'User ID', type: 'string', description: "ID of the user who triggered or was affected by the event."},
    { id: 'username', label: 'Username', type: 'string', description: "Username of the user who triggered the event."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel where the event occurred."},
    { id: 'guild_id', label: 'Server ID', type: 'string', description: "ID of the server where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', description: "Token used to respond to the interaction."}
  ]
};

