export default {
  description: 'Gets a role\'s combined guild permissions together with the @everyone role.',
  type: 'action_get_guild_role_permissions',
  category: 'Discord Actions',
  label: 'Get Guild Role Permissions',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Guild Role Permissions."},
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server whose permissions to check."},
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '', description: "ID of the role whose permissions to check."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Guild Role Permissions completes."},
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', description: "Calculated permission bitfield."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};