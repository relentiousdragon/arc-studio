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
      "defaultValue": "",
      description: "Text to test, extract from, or replace."
    },
    {
      "id": "pattern",
      "label": "Pattern",
      "type": "string",
      "defaultValue": "",
      description: "JavaScript regular expression pattern."
    },
    {
      "id": "flags",
      "label": "Flags",
      "type": "string",
      "defaultValue": "",
      description: "Regular expression flags, such as i or g."
    },
    {
      "id": "replacement",
      "label": "Replacement",
      "type": "string",
      "defaultValue": "",
      description: "Text placed in place of each match."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      description: "Resulting text after a test or replacement."
    },
    {
      "id": "matched",
      "label": "Matched",
      "type": "boolean",
      description: "True when the pattern matches the input."
    },
    {
      "id": "match",
      "label": "First Match",
      "type": "string",
      description: "Text of the first match."
    },
    {
      "id": "matches",
      "label": "All Matches",
      "type": "object",
      description: "All matched text values."
    },
    {
      "id": "captures",
      "label": "Capture Groups",
      "type": "object",
      description: "Capture groups from the first match."
    },
    {
      "id": "index",
      "label": "Index",
      "type": "number",
      description: "Zero-based position of the first match."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the pattern and flags are valid."
    },
    {
      "id": "error",
      "label": "Error",
      "type": "string",
      description: "Error details when the pattern is invalid or rejected."
    }
  ]
};
