export default {
  "description": "Formats a finite number with locale grouping, decimal, percent, or currency style. Percent style scales the number by 100.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "data_format_number",
  "category": "Values & Data",
  "label": "Format Number",
  "color": "#06b6d4",
  "defaultData": {
    "locale": "en-US",
    "style": "decimal",
    "currency": "USD",
    "minimum_fraction_digits": 0,
    "maximum_fraction_digits": 2
  },
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "locale",
      "label": "Locale",
      "type": "string",
      "defaultValue": "en-US"
    },
    {
      "id": "style",
      "label": "Style",
      "type": "string",
      "defaultValue": "decimal"
    },
    {
      "id": "currency",
      "label": "Currency",
      "type": "string",
      "defaultValue": "USD"
    },
    {
      "id": "minimum_fraction_digits",
      "label": "Minimum decimals",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "maximum_fraction_digits",
      "label": "Maximum decimals",
      "type": "number",
      "defaultValue": 2
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Formatted",
      "type": "string"
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean"
    }
  ]
};
