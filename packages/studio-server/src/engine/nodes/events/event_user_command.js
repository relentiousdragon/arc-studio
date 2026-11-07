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
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'command_name', label: 'Command Name', type: 'string' },
    { id: 'target_user_id', label: 'Target User ID', type: 'string' },
    { id: 'target_user', label: 'Target User', type: 'object' },
    { id: 'target_member', label: 'Target Member', type: 'object' },
    { id: 'user_id', label: 'User ID', type: 'string' },
    { id: 'username', label: 'Username', type: 'string' },
    { id: 'channel_id', label: 'Channel ID', type: 'string' },
    { id: 'guild_id', label: 'Server ID', type: 'string' },
    { id: 'application_id', label: 'Application ID', type: 'string' },
    { id: 'interaction_id', label: 'Interaction ID', type: 'string' },
    { id: 'interaction_token', label: 'Interaction Token', type: 'string' }
  ]
};

