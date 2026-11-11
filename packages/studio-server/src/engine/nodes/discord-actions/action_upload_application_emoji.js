export default {
  description: 'Uploads an emoji to the bot application. Requires a PNG, JPEG, GIF, or WebP image no larger than 256 KiB.',
  type: 'action_upload_application_emoji', category: 'Discord Actions', label: 'Upload Bot Emoji', color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Upload Bot Emoji."}, { id: 'name', label: 'Emoji Name', type: 'string', defaultValue: '', description: "Name to assign."},
    { id: 'files', label: 'Image File', type: 'object', defaultValue: [], description: "Files to attach to the message."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Upload Bot Emoji completes."}, { id: 'emoji_id', label: 'Emoji ID', type: 'string', description: "ID of the created emoji."},
    { id: 'emoji_name', label: 'Emoji Name', type: 'string', description: "Name of the created emoji."}, { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
