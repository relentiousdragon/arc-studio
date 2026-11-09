export default {
  description: 'Uploads a PNG, APNG, or GIF sticker to a server. Requires Create Expressions. File limit is 512 KiB.',
  type: 'action_upload_guild_sticker', category: 'Discord Actions', label: 'Upload Server Sticker', color: '#10b981',
  inferredPermissions: ['Create Expressions'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'name', label: 'Sticker Name', type: 'string', defaultValue: '' }, { id: 'description', label: 'Description', type: 'string', defaultValue: '' },
    { id: 'tags', label: 'Tags (emoji)', type: 'string', defaultValue: '✨' }, { id: 'files', label: 'Sticker File', type: 'object', defaultValue: [] },
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'sticker_id', label: 'Sticker ID', type: 'string' },
    { id: 'sticker_name', label: 'Sticker Name', type: 'string' }, { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
