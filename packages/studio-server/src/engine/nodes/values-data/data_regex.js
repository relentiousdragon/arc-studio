export default {
  "description": "Tests, extracts, or replaces text with a JavaScript regular expression. Inputs are bounded and risky regex structures are rejected.",
  "type": "data_regex",
  "category": "Values & Data",
  "label": "Regular Expression",
  "color": "#06b6d4",
  "defaultData": {
    "mode": "test",
    "text": "",
    "pattern": "",
    "flags": "",
    "replacement": ""
  },
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "pattern",
      "label": "Pattern",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "flags",
      "label": "Flags",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "replacement",
      "label": "Replacement",
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
      "id": "matched",
      "label": "Matched",
      "type": "boolean"
    },
    {
      "id": "match",
      "label": "First Match",
      "type": "string"
    },
    {
      "id": "matches",
      "label": "All Matches",
      "type": "object"
    },
    {
      "id": "captures",
      "label": "Capture Groups",
      "type": "object"
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string"
    }
  ]
};
