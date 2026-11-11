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
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Await Interaction."},
    { id: 'custom_id', label: 'Custom ID', type: 'string', defaultValue: '', description: "Custom ID to match on the interaction."},
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: "Only accept interactions from this user."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "Only accept interactions from this channel."},
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '', description: "Only accept interactions from this message."},
    { id: 'timeout_seconds', label: 'Timeout (s)', type: 'number', defaultValue: 60, description: "Maximum time to wait for a matching interaction."}
  ],
  outputs: [
    { id: 'exec', label: 'Success', type: 'exec', description: "Continues after Await Interaction completes."},
    { id: 'filter_failed_exec', label: 'Filter Failed', type: 'exec', description: "Runs when the interaction does not match the filters."},
    { id: 'timeout_exec', label: 'Timeout', type: 'exec', description: "Runs when no matching interaction arrives before the timeout."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', description: "ID of the interaction that was handled."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', description: "Token used to continue responding to the interaction."},
    { id: 'custom_id', label: 'Custom ID', type: 'string', description: "Custom ID to match on the interaction."},
    { id: 'user_id', label: 'User ID', type: 'string', description: "ID of the user who interacted."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', description: "ID of the channel where the interaction occurred."},
    { id: 'guild_id', label: 'Server ID', type: 'string', description: "ID of the server where the interaction occurred."},
    { id: 'message_id', label: 'Message ID', type: 'string', description: "ID of the message that received the interaction."},
    { id: 'selected_values', label: 'Selected Values', type: 'string', description: "Values selected in the received menu."},
    { id: 'interaction', label: 'Interaction Object', type: 'object', description: "Full interaction received by this node."}
  ]
};
