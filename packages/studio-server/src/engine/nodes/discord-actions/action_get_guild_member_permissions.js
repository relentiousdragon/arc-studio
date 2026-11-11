export default {
  description: "Gets a member's computed guild permissions from their roles and the @everyone role.",
  type: 'action_get_guild_member_permissions',
  category: 'Discord Actions',
  label: 'Get Guild Member Permissions',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Guild Member Permissions."},
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server whose permissions to check."},
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: "ID of the member whose permissions to check."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Guild Member Permissions completes."},
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', description: "Calculated permission bitfield."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};