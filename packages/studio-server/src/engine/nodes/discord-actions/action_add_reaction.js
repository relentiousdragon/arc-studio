export default {
  description: 'Adds a reaction to a message. Requires Read Message History, and Add Reactions if the emoji is not already present.',
  type: 'action_add_reaction', category: 'Discord Actions', label: 'Add Reaction', color: '#22c55e',
  inferredPermissions: ['Read Message History', 'Add Reactions'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: 'Runs this action.' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: 'Channel that contains the message.' },
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '', description: 'Message that receives the reaction.' },
    { id: 'emoji', label: 'Emoji', type: 'string', defaultValue: '', description: 'Unicode emoji or a custom emoji name and ID.' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: 'Continues after the reaction request succeeds.' },
    { id: 'success', label: 'Success', type: 'boolean', description: 'Whether Discord accepted the reaction request.' }
  ]
};
