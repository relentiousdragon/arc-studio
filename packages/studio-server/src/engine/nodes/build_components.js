export default {
  description: 'Builds a Components V2 message layout with text, sections, containers, media, separators, files, and interactive controls.',
  type: 'build_components',
  category: 'Values & Data',
  label: 'Component Builder',
  color: '#5865f2',
  defaultData: { componentsV2: [] },
  inputs: [],
  outputs: [{ id: 'components', label: 'Components', type: 'object' }]
};
