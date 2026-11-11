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
      "defaultValue": 0,
      description: "Finite number to format."
    },
    {
      "id": "locale",
      "label": "Locale",
      "type": "string",
      "defaultValue": "en-US",
      description: "Locale used for grouping and decimal symbols."
    },
    {
      "id": "style",
      "label": "Style",
      "type": "string",
      "defaultValue": "decimal",
      description: "Number display style."
    },
    {
      "id": "currency",
      "label": "Currency",
      "type": "string",
      "defaultValue": "USD",
      description: "Currency code used for currency style."
    },
    {
      "id": "minimum_fraction_digits",
      "label": "Minimum decimals",
      "type": "number",
      "defaultValue": 0,
      description: "Minimum number of fraction digits to display."
    },
    {
      "id": "maximum_fraction_digits",
      "label": "Maximum decimals",
      "type": "number",
      "defaultValue": 2,
      description: "Maximum number of fraction digits to display."
    }
  ],
  "outputs": [
    {
      "id": "text",
      "label": "Formatted",
      "type": "string",
      description: "Formatted number text."
    },
    {
      "id": "valid",
      "label": "Valid",
      "type": "boolean",
      description: "True when the number and formatting options are valid."
    }
  ]
};
