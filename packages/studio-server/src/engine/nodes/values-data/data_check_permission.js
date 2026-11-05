import { PermissionFlagEntries } from 'chezcord/constants';
//
export default {
  description: 'Checks whether a permission bitfield includes every selected Discord permission. Connect the Permissions Bitfield output from a guild or channel permission node.',
  type: 'data_check_permission',
  category: 'Values & Data',
  label: 'Check Permission',
  color: '#06b6d4',
  editorControls: [
    {
      type: 'text', key: 'permissions', inputId: 'permissions', label: 'Permissions Bitfield', defaultValue: '',
      placeholder: 'Connect a Permissions Bitfield output'
    },
    {
      type: 'select', key: 'permission', inputId: 'permission', label: 'Permissions', defaultValue: ['VIEW_CHANNEL'], multiple: true, searchable: true, searchThreshold: 8,
      options: PermissionFlagEntries.map(({ name, label }) => ({ value: name, label }))
    }
  ],
  inputs: [
    { id: 'permissions', label: 'Permissions Bitfield', type: 'string', defaultValue: '' },
    { id: 'permission', label: 'Permissions', type: 'arg', defaultValue: ['VIEW_CHANNEL'] }
  ],
  outputs: [
    { id: 'has_permission', label: 'Has Permission', type: 'boolean' },
    { id: 'valid', label: 'Valid Bitfield', type: 'boolean' }
  ]
};
