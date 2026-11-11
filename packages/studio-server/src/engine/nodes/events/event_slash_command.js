export default {
  description: 'Fires when an application slash command is invoked',
  type: 'event_slash_command',
  dynamicPins: { kind: 'slash-options', version: 2 },
  category: 'Events',
  label: 'On Slash Command',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayInteractionType: 2,
  gatewayCommandType: 1,
  defaultData: {
    commandName: '',
    description: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when an application slash command is invoked."},
    { id: 'command_name', label: 'Command Name', type: 'string', description: "Name of the invoked application command."},
    { id: 'subcommand_group_name', label: 'Subcommand Group', type: 'string', description: "Name of the invoked subcommand group, if any."},
    { id: 'subcommand_name', label: 'Subcommand', type: 'string', description: "Name of the invoked subcommand, if any."},
    { id: 'user_id', label: 'User ID', type: 'string', description: "ID of the user who triggered or was affected by the event."},
    { id: 'username', label: 'Username', type: 'string', description: "Username of the user who triggered the event."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel where the event occurred."},
    { id: 'thread_id', label: 'Thread ID', type: 'string', description: "ID of the thread where the event occurred."},
    { id: 'guild_id', label: 'Server ID', type: 'string', description: "ID of the server where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', description: "Token used to respond to the interaction."},
    { id: 'options', label: 'Command Arguments', type: 'object', description: "Arguments submitted with the command."}
  ]
};
