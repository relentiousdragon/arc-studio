export default {
  "description": "Tests, extracts, or replaces text with native JavaScript regular expressions. Each match runs in an isolated process with a time limit.",
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
      description: "Native JavaScript regular expression pattern, including lookarounds and backreferences."
    },
    {
      "id": "flags",
      "label": "Flags",
      "type": "string",
      "defaultValue": "",
      description: "JavaScript regular expression flags. Separate flags with commas or spaces, such as g, i, and s."
    },
    {
      "id": "replacement",
      "label": "Replacement",
      "type": "string",
      "defaultValue": "",
      description: "Text placed in place of each match, limited to 8,192 characters."
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
      description: "Up to 1,000 matched text values."
    },
    {
      "id": "captures",
      "label": "Capture Groups",
      "type": "object",
      description: "Capture groups from the first match."
    },
    {
      "id": "named_captures",
      "label": "Named Captures",
      "type": "object",
      description: "Named capture groups from the first match."
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
      description: "Error details when the pattern is invalid or a match reaches its time limit."
    }
  ]
};
