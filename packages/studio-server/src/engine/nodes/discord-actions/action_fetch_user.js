export default {
  description: 'Fetches a Discord user profile and exposes both the full user object, avatar, and common profile fields',
  type: 'action_fetch_user',
  category: 'Discord Actions',
  label: 'Get User Info',
  color: '#10b981',
  defaultData: {
    user_id: ''
  },
  editorControls: [
    { key: 'user_id', label: 'User ID', type: 'text', placeholder: 'User ID' }
  ],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get User Info."},
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: "ID of the user to fetch."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get User Info completes."},
    { id: 'user', label: 'User Object', type: 'object', description: "Full user record returned by Discord."},
    { id: 'user_id_out', label: 'User ID', type: 'string', description: "ID of the returned user."},
    { id: 'username', label: 'Username', type: 'string', description: "Username of the returned user."},
    { id: 'global_name', label: 'Display Name', type: 'string', description: "Display name of the returned user."},
    { id: 'discriminator', label: 'Discriminator', type: 'string', description: "Legacy discriminator of the returned user."},
    { id: 'avatar', label: 'Avatar Hash', type: 'string', description: "Avatar hash of the returned user."},
    { id: 'avatar_url', label: 'Avatar URL', type: 'string', description: "URL of the returned user avatar."},
    { id: 'banner', label: 'Banner Hash', type: 'string', description: "Banner hash of the returned user."},
    { id: 'banner_url', label: 'Banner URL', type: 'string', description: "URL of the returned user banner."},
    { id: 'bot', label: 'Is Bot', type: 'boolean', description: "Whether the returned user is a bot."},
    { id: 'public_flags', label: 'Public Flags', type: 'number', description: "Public user flag bitfield."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
