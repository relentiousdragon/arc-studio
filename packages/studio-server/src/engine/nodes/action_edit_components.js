export default {
  type: 'action_edit_components',
  category: 'Discord Actions',
  label: 'Edit Components',
  description: 'Replaces the components on an existing message with legacy components or Components V2.',
  color: '#10b981',
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'channel_id', label: 'Channel ID', type: 'string', defaultValue: '' },
    { id: 'message_id', label: 'Message ID', type: 'string', defaultValue: '' },
    { id: 'components', label: 'Components (Optional)', type: 'object' }
  ],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec' },
    { id: 'message_id', label: 'Message ID', type: 'string' }
  ]
};
