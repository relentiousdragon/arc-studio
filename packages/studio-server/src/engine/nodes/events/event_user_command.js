export default {
  description: 'Fires when an app user context menu command is invoked on a user',
  type: 'event_user_command',
  category: 'Events',
  label: 'On User Command',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayInteractionType: 2,
  gatewayCommandType: 2,
  createdAt: '2026-11-07T13:30:00.000Z',
  defaultData: {
    commandName: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when an app user context menu command is invoked on a user."},
    { id: 'command_name', label: 'Command Name', type: 'string', description: "Name of the invoked application command."},
    { id: 'target_user_id', label: 'Target User ID', type: 'string', description: "ID of the user selected by the command."},
    { id: 'target_user', label: 'Target User', type: 'object', description: "User selected by the command."},
    { id: 'target_member', label: 'Target Member', type: 'object', description: "Server member selected by the command."},
    { id: 'user_id', label: 'User ID', type: 'string', description: "ID of the user who triggered or was affected by the event."},
    { id: 'username', label: 'Username', type: 'string', description: "Username of the user who triggered the event."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel where the event occurred."},
    { id: 'guild_id', label: 'Server ID', type: 'string', description: "ID of the server where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', description: "Token used to respond to the interaction."}
  ]
};

