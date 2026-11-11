export default {
  description: "Gets a member's channel permissions, including role and member overwrites.",
  type: 'action_get_channel_member_permissions',
  category: 'Discord Actions',
  label: 'Get Channel Member Permissions',
  color: '#10b981',
  defaultData: { implicit: true },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Channel Member Permissions."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel whose permissions to check."},
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: "ID of the user whose permissions to check."},
    { id: 'implicit', label: 'Apply Implicit Masking', type: 'boolean', defaultValue: true, description: "Apply Discord implied permission rules to the result."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Channel Member Permissions completes."},
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', description: "Calculated permission bitfield."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};