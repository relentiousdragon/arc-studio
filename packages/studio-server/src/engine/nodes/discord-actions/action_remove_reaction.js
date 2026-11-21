export default {
  description: 'Removes your reaction, one user’s reaction, every reaction for one emoji, or all reactions from a message. Manage Messages is required to remove another user’s reaction or clear reactions.',
  type: 'action_remove_reaction', category: 'Discord Actions', label: 'Remove Reaction', color: '#ef4444',
  defaultData: { target: 'own' },
  inferredPermissionRules: [{ input: 'target', values: ['user', 'emoji', 'all'], permissions: ['Manage Messages'] }],
  editorControls: [{ key: 'target', label: 'Remove', type: 'select', options: [
    { value: 'own', label: 'My reaction' }, { value: 'user', label: 'Specific user reaction' },
    { value: 'emoji', label: 'All reactions for emoji' }, { value: 'all', label: 'All reactions on message' }
  ] }],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: 'Runs this action.' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: 'Channel that contains the message.' },
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '', description: 'Message whose reaction should be removed.' },
    { id: 'emoji', label: 'Emoji', type: 'string', defaultValue: '', description: 'Emoji used to select a reaction. Required for one user or one emoji.' },
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: 'User whose reaction should be removed.' },
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '', description: 'Optional reason recorded in the audit log.' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: 'Continues after the reaction request succeeds.' },
    { id: 'success', label: 'Success', type: 'boolean', description: 'Whether Discord accepted the removal request.' }
  ]
};
