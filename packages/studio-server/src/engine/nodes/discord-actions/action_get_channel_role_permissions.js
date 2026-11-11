export default {
  description: "Gets a role's channel permissions together with @everyone, applying channel overwrites.",
  type: 'action_get_channel_role_permissions',
  category: 'Discord Actions',
  label: 'Get Channel Role Permissions',
  color: '#10b981',
  defaultData: { implicit: true },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Channel Role Permissions."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel whose permissions to check."},
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '', description: "ID of the role whose permissions to check."},
    { id: 'implicit', label: 'Apply Implicit Masking', type: 'boolean', defaultValue: true, description: "Apply Discord implied permission rules to the result."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Channel Role Permissions completes."},
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', description: "Calculated permission bitfield."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};