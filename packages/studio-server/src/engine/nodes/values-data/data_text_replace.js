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
      defaultValue: '',
      description: "Text to search and update."
    },
    {
      id: 'search',
      label: 'Find',
      type: 'string',
      defaultValue: '',
      description: "Exact text to find."
    },
    {
      id: 'replacement',
      label: 'Replace with',
      type: 'string',
      defaultValue: '',
      description: "Text to put in place of each match."
    },
    {
      id: 'all',
      label: 'Find All / Replace All',
      type: 'boolean',
      defaultValue: true,
      description: "Replace every match instead of only the first."
    }
  ],
  outputs: [
    {
      id: 'text',
      label: 'Text',
      type: 'string',
      description: "Text after the matching content is replaced."
    },
    {
      id: 'replacements',
      label: 'Replacements',
      type: 'number',
      description: "Number of replacements made."
    }
  ]
};
