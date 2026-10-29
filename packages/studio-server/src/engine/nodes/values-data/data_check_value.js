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
      "defaultValue": undefined
    },
    {
      "id": "fallback",
      "label": "Fallback",
      "type": "arg",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "value",
      "label": "Value or fallback",
      "type": "arg"
    },
    {
      "id": "state",
      "label": "State",
      "type": "string"
    },
    {
      "id": "is_missing",
      "label": "Missing",
      "type": "boolean"
    },
    {
      "id": "is_null",
      "label": "Null",
      "type": "boolean"
    },
    {
      "id": "is_empty",
      "label": "Empty text",
      "type": "boolean"
    },
    {
      "id": "has_value",
      "label": "Has value",
      "type": "boolean"
    }
  ]
};
