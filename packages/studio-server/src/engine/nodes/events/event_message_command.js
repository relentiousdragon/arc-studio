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
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'command_name', label: 'Command Name', type: 'string' },
    { id: 'target_message_id', label: 'Target Message ID', type: 'string' },
    { id: 'target_message', label: 'Target Message', type: 'object' },
    { id: 'target_message_content', label: 'Target Message Content', type: 'string' },
    { id: 'target_author_id', label: 'Target Author ID', type: 'string' },
    { id: 'user_id', label: 'User ID', type: 'string' },
    { id: 'username', label: 'Username', type: 'string' },
    { id: 'channel_id', label: 'Channel ID', type: 'string' },
    { id: 'guild_id', label: 'Server ID', type: 'string' },
    { id: 'application_id', label: 'Application ID', type: 'string' },
    { id: 'interaction_id', label: 'Interaction ID', type: 'string' },
    { id: 'interaction_token', label: 'Interaction Token', type: 'string' }
  ]
};

