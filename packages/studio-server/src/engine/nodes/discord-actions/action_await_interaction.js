export default {
  description: 'Waits for an incoming button click or select menu interaction matching optional filters, with timeout and filter-failed branches.',
  type: 'action_await_interaction',
  category: 'Discord Actions',
  label: 'Await Interaction',
  color: '#5865F2',
  defaultData: {
    custom_id: '',
    user_id: '',
    channel_id: '',
    message_id: '',
    timeout_seconds: 60
  },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'custom_id', label: 'Custom ID', type: 'string', defaultValue: '' },
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '' },
    { id: 'timeout_seconds', label: 'Timeout (s)', type: 'number', defaultValue: 60 }
  ],
  outputs: [
    { id: 'exec', label: 'Success', type: 'exec' },
    { id: 'filter_failed_exec', label: 'Filter Failed', type: 'exec' },
    { id: 'timeout_exec', label: 'Timeout', type: 'exec' },
    { id: 'interaction_id', label: 'Interaction ID', type: 'string' },
    { id: 'interaction_token', label: 'Interaction Token', type: 'string' },
    { id: 'custom_id', label: 'Custom ID', type: 'string' },
    { id: 'user_id', label: 'User ID', type: 'string' },
    { id: 'channel_id', label: 'Channel ID', type: 'string' },
    { id: 'guild_id', label: 'Server ID', type: 'string' },
    { id: 'message_id', label: 'Message ID', type: 'string' },
    { id: 'selected_values', label: 'Selected Values', type: 'string' },
    { id: 'interaction', label: 'Interaction Object', type: 'object' }
  ]
};

