export default {
  description: 'Uploads a PNG, APNG, or GIF sticker to a server. Requires Create Expressions. File limit is 512 KiB.',
  type: 'action_upload_guild_sticker', category: 'Discord Actions', label: 'Upload Server Sticker', color: '#10b981',
  inferredPermissions: ['Create Expressions'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts uploading a sticker to the server."}, { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server to receive the sticker."},
    { id: 'name', label: 'Sticker Name', type: 'string', defaultValue: '', description: "Name to assign."}, { id: 'description', label: 'Description', type: 'string', defaultValue: '', description: "Description to assign."},
    { id: 'tags', label: 'Tags (emoji)', type: 'string', defaultValue: '✨', description: "Emoji tags used to identify the sticker."}, { id: 'files', label: 'Sticker File', type: 'object', defaultValue: [], description: "Files to attach to the message."},
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '', description: "Reason recorded in the audit log."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Upload Server Sticker completes."}, { id: 'sticker_id', label: 'Sticker ID', type: 'string', description: "ID of the created sticker."},
    { id: 'sticker_name', label: 'Sticker Name', type: 'string', description: "Name of the created sticker."}, { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
