export default {
  description: 'Uploads an emoji to the bot application. Requires a PNG, JPEG, GIF, or WebP image no larger than 256 KiB.',
  type: 'action_upload_application_emoji', category: 'Discord Actions', label: 'Upload Bot Emoji', color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'name', label: 'Emoji Name', type: 'string', defaultValue: '' },
    { id: 'files', label: 'Image File', type: 'object', defaultValue: [] }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' }, { id: 'emoji_id', label: 'Emoji ID', type: 'string' },
    { id: 'emoji_name', label: 'Emoji Name', type: 'string' }, { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
