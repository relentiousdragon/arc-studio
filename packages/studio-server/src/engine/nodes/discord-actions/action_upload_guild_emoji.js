export default {
  description: 'Uploads a PNG, JPEG, GIF, or WebP emoji to a server. Requires Create Expressions and a file no larger than 256 KiB.',
  type: 'action_upload_guild_emoji', category: 'Discord Actions', label: 'Upload Server Emoji', color: '#10b981',
  inferredPermissions: ['Create Expressions'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'name', label: 'Emoji Name', type: 'string', defaultValue: '' }, { id: 'files', label: 'Image File', type: 'object', defaultValue: [] },
    { id: 'roles', label: 'Role IDs', type: 'object', defaultValue: [] }, { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'emoji_id', label: 'Emoji ID', type: 'string' },
    { id: 'emoji_name', label: 'Emoji Name', type: 'string' }, { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
