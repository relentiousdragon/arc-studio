export default {
  description: 'Fetches a server role and exposes its name, color, position, permissions, and full object.',
  type: 'action_fetch_role',
  category: 'Discord Actions',
  label: 'Get Role Info',
  color: '#10b981',
  createdAt: '2026-11-05T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Get Role Info."},
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '', description: "ID of the server containing the role."},
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '', description: "ID of the role to fetch."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Get Role Info completes."},
    { id: 'role', label: 'Role Object', type: 'object', description: "Full role record returned by Discord."},
    { id: 'role_id_out', label: 'Role ID', type: 'string', description: "ID of the returned role."},
    { id: 'name', label: 'Name', type: 'string', description: "Name to assign."},
    { id: 'color', label: 'Color', type: 'number', description: "Role color as an RGB integer."},
    { id: 'color_hex', label: 'Color Hex', type: 'string', description: "Role color in hexadecimal form."},
    { id: 'hoist', label: 'Show Separately', type: 'boolean', description: "Whether the role appears separately in the member list."},
    { id: 'mentionable', label: 'Mentionable', type: 'boolean', description: "Whether users can mention the role."},
    { id: 'managed', label: 'Managed', type: 'boolean', description: "Whether Discord manages the role."},
    { id: 'position', label: 'Position', type: 'number', description: "Position of the channel in its list."},
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', description: "Calculated permission bitfield."},
    { id: 'icon', label: 'Icon Hash', type: 'string', description: "Custom role icon hash, when set."},
    { id: 'unicode_emoji', label: 'Unicode Emoji', type: 'string', description: "Unicode emoji assigned to the role."},
    { id: 'flags', label: 'Role Flags', type: 'number', description: "Discord flags value."},
    { id: 'tags', label: 'Role Tags', type: 'object', description: "Metadata tags attached to the role."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
