export default {
  description: "Gets a member's computed guild permissions from their roles and the @everyone role.",
  type: 'action_get_guild_member_permissions',
  category: 'Discord Actions',
  label: 'Get Guild Member Permissions',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};