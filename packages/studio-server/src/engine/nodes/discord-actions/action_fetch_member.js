export default {
  description: 'Fetches a member in a server and exposes the full member and user objects, roles, and profile fields',
  type: 'action_fetch_member',
  category: 'Discord Actions',
  label: 'Get Server Member',
  color: '#10b981',
  defaultData: {
    guild_id: '',
    user_id: ''
  },
  editorControls: [
    { key: 'guild_id', label: 'Server ID', type: 'text', placeholder: 'Server ID' },
    { key: 'user_id', label: 'User ID', type: 'text', placeholder: 'User ID' }
  ],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Server Member."},
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server containing the member."},
    { id: 'user_id', label: 'User ID', type: 'string', defaultValue: '', description: "ID of the member to retrieve."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Server Member completes."},
    { id: 'member', label: 'Member Object', type: 'object', description: "Full server member record returned by Discord."},
    { id: 'user', label: 'User Object', type: 'object', description: "User account for the returned member."},
    { id: 'user_id_out', label: 'User ID', type: 'string', description: "ID of the returned user."},
    { id: 'username', label: 'Username', type: 'string', description: "Username of the returned user."},
    { id: 'nickname', label: 'Nickname', type: 'string', description: "Nickname set for the server member."},
    { id: 'roles', label: 'Role IDs', type: 'object', description: "Role IDs assigned to the member."},
    { id: 'avatar', label: 'Avatar Hash', type: 'string', description: "Avatar hash of the returned user."},
    { id: 'avatar_url', label: 'Avatar URL', type: 'string', description: "URL of the returned user avatar."},
    { id: 'joined_at', label: 'Joined At', type: 'string', description: "Time the member joined the server."},
    { id: 'premium_since', label: 'Boosted Since', type: 'string', description: "Time the member began boosting the server."},
    { id: 'deaf', label: 'Server Deafened', type: 'boolean', description: "Whether the server has deafened the member."},
    { id: 'mute', label: 'Server Muted', type: 'boolean', description: "Whether the server has muted the member."},
    { id: 'pending', label: 'Membership Pending', type: 'boolean', description: "Whether the member must complete membership screening."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
