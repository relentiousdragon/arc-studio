export default {
  description: 'Gets a role\'s combined guild permissions together with the @everyone role.',
  type: 'action_get_guild_role_permissions',
  category: 'Discord Actions',
  label: 'Get Guild Role Permissions',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};