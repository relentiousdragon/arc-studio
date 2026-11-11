export default {
  description: 'Deletes 2 to 100 messages from a server channel. Messages older than 14 days cannot be bulk deleted. Requires Manage Messages.',
  type: 'action_bulk_delete_messages', category: 'Discord Actions', label: 'Bulk Delete Messages', color: '#ef4444',
  inferredPermissions: ['Manage Messages'],
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Starts Bulk Delete Messages."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '', description: "ID of the channel containing the messages."},
    { id: 'message_ids', label: 'Message IDs', type: 'object', defaultValue: [], description: "IDs of the messages to delete."},
    { id: 'reason', label: 'Audit Log Reason', type: 'string', defaultValue: '', description: "Reason recorded in the audit log."}
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Continues after Bulk Delete Messages completes."},
    { id: 'deleted_count', label: 'Deleted Count', type: 'number', description: "Number of messages deleted."},
    { id: 'success', label: 'Success', type: 'boolean', description: "Whether the action completed successfully."}
  ]
};
