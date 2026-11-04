export default {
  description: 'Changes one Components V2 block field while preserving the rest of the layout. Connect the result to a message or interaction reply.',
  type: 'modify_components_v2',
  category: 'Values & Data',
  label: 'Modify Components V2',
  color: '#06b6d4',
  defaultData: { target_id: 'all', property: 'spoiler', item_index: -1, value: false },
  inputs: [
    { id: 'components', label: 'Components V2', type: 'object' },
    { id: 'target_id', label: 'Block ID (all for matching blocks)', type: 'string', defaultValue: 'all' },
    { id: 'property', label: 'Property', type: 'string', defaultValue: 'spoiler' },
    { id: 'item_index', label: 'Media Item Index (-1 for all)', type: 'number', defaultValue: -1 },
    { id: 'value', label: 'Value', type: 'any', defaultValue: false }
  ],
  outputs: [{ id: 'components', label: 'Components V2', type: 'object' }]
};
