export default {
  description: "Gets a role's channel permissions together with @everyone, applying channel overwrites.",
  type: 'action_get_channel_role_permissions',
  category: 'Discord Actions',
  label: 'Get Channel Role Permissions',
  color: '#10b981',
  defaultData: { implicit: true },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '' },
    { id: 'implicit', label: 'Apply Implicit Masking', type: 'boolean', defaultValue: true }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};