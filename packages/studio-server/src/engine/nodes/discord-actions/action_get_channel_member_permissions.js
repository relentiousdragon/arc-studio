export default {
  description: "Gets a member's channel permissions, including role and member overwrites.",
  type: 'action_get_channel_member_permissions',
  category: 'Discord Actions',
  label: 'Get Channel Member Permissions',
  color: '#10b981',
  defaultData: { implicit: true },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '' },
    { id: 'implicit', label: 'Apply Implicit Masking', type: 'boolean', defaultValue: true }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};