export default {
  "description": "Distinguishes missing, null, empty text, and real values. The Value output uses the fallback unless a real value is present.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "data_check_value",
  "category": "Values & Data",
  "label": "Check Value",
  "color": "#06b6d4",
  "defaultData": {
    "fallback": ""
  },
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": undefined,
      description: "Value to check for missing, null, empty, or present state."
    },
    {
      "id": "fallback",
      "label": "Fallback",
      "type": "arg",
      "defaultValue": "",
      description: "Value to return when the input is missing, null, or empty."
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value or fallback",
      "type": "arg",
      description: "Original value when present, otherwise the fallback."
    },
    {
      "id": "state",
      "label": "State",
      "type": "string",
      description: "State detected for the input value."
    },
    {
      "id": "is_missing",
      "label": "Missing",
      "type": "boolean",
      description: "True when the input value is missing."
    },
    {
      "id": "is_null",
      "label": "Null",
      "type": "boolean",
      description: "True when the input value is null."
    },
    {
      "id": "is_empty",
      "label": "Empty text",
      "type": "boolean",
      description: "True when the input is empty text."
    },
    {
      "id": "has_value",
      "label": "Has value",
      "type": "boolean",
      description: "True when the input contains a usable value."
    }
  ]
};
