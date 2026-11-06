export default {
  description: 'Fetches a server role and exposes its name, color, position, permissions, and full object.',
  type: 'action_fetch_role',
  category: 'Discord Actions',
  label: 'Get Role Info',
  color: '#10b981',
  createdAt: '2026-11-05T00:00:00.000Z',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'guild_id', label: 'Server ID', type: 'string', defaultValue: '' },
    { id: 'role_id', label: 'Role ID', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'role', label: 'Role Object', type: 'object' },
    { id: 'role_id_out', label: 'Role ID', type: 'string' },
    { id: 'name', label: 'Name', type: 'string' },
    { id: 'color', label: 'Color', type: 'number' },
    { id: 'color_hex', label: 'Color Hex', type: 'string' },
    { id: 'hoist', label: 'Show Separately', type: 'boolean' },
    { id: 'mentionable', label: 'Mentionable', type: 'boolean' },
    { id: 'managed', label: 'Managed', type: 'boolean' },
    { id: 'position', label: 'Position', type: 'number' },
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string' },
    { id: 'icon', label: 'Icon Hash', type: 'string' },
    { id: 'unicode_emoji', label: 'Unicode Emoji', type: 'string' },
    { id: 'flags', label: 'Role Flags', type: 'number' },
    { id: 'tags', label: 'Role Tags', type: 'object' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
