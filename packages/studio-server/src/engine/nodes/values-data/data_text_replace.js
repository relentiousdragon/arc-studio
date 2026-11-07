export default {
  description: 'Replaces literal occurrences of a search string and reports how many replacements were made.',
  type: 'data_text_replace',
  category: 'Values & Data',
  label: 'Replace Text',
  color: '#06b6d4',
  defaultData: {
    text: '',
    search: '',
    replacement: '',
    all: true
  },
  editorControls: [
    { key: 'search', label: 'Find', type: 'text', placeholder: 'Text to find' },
    { key: 'replacement', label: 'Replace with', type: 'text', placeholder: 'Replacement text' },
    { key: 'all', label: 'Find all occurrences', type: 'checkbox', defaultValue: true }
  ],
  inputs: [
    {
      id: 'text',
      label: 'Text',
      type: 'string',
      defaultValue: ''
    },
    {
      id: 'search',
      label: 'Find',
      type: 'string',
      defaultValue: ''
    },
    {
      id: 'replacement',
      label: 'Replace with',
      type: 'string',
      defaultValue: ''
    },
    {
      id: 'all',
      label: 'Find All / Replace All',
      type: 'boolean',
      defaultValue: true
    }
  ],
  outputs: [
    {
      id: 'text',
      label: 'Text',
      type: 'string'
    },
    {
      id: 'replacements',
      label: 'Replacements',
      type: 'number'
    }
  ]
};
