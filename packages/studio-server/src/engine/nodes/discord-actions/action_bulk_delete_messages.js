export default {
  description: 'Deletes 2 to 100 messages from a server channel. Messages older than 14 days cannot be bulk deleted. Requires Manage Messages.',
  type: 'action_bulk_delete_messages', category: 'Discord Actions', label: 'Bulk Delete Messages', color: '#ef4444',
  inferredPermissions: ['Manage Messages'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'message_ids', label: 'Message IDs', type: 'object', defaultValue: [] },
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'deleted_count', label: 'Deleted Count', type: 'number' },
    { id: 'success', label: 'Success', type: 'boolean' }
  ]
};
