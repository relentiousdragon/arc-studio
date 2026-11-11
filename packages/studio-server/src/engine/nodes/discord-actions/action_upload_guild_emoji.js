export default {
  description: 'Uploads a PNG, JPEG, GIF, or WebP emoji to a server. Requires Create Expressions and a file no larger than 256 KiB.',
  type: 'action_upload_guild_emoji', category: 'Discord Actions', label: 'Upload Server Emoji', color: '#10b981',
  inferredPermissions: ['Create Expressions'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts uploading an emoji to the server."}, { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server to receive the emoji."},
    { id: 'name', label: 'Emoji Name', type: 'string', defaultValue: '', description: "Name to assign."}, { id: 'files', label: 'Image File', type: 'object', defaultValue: [], description: "Files to attach to the message."},
    { id: 'roles', label: 'Role IDs', type: 'object', defaultValue: [], description: "Role IDs allowed to use the emoji."}, { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '', description: "Reason recorded in the audit log."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Upload Server Emoji completes."}, { id: 'emoji_id', label: 'Emoji ID', type: 'string', description: "ID of the created emoji."},
    { id: 'emoji_name', label: 'Emoji Name', type: 'string', description: "Name of the created emoji."}, { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
