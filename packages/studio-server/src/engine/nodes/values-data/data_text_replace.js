export default {
  "description": "Replaces every literal occurrence of a search string and reports how many replacements were made.",
  "type": "data_text_replace",
  "category": "Values & Data",
  "label": "Replace Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "search",
      "label": "Find",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "replacement",
      "label": "Replace with",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string"
    },
    {
      "id": "replacements",
      "label": "Replacements",
      "type": "number"
    }
  ]
};
