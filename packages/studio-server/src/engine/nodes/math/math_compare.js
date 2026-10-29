export default {
  "description": "Compares two numbers and returns true or false",
  "type": "math_compare",
  "category": "Math",
  "label": "Compare Numbers",
  "color": "#38bdf8",
  "editorControls": [
    {
      "type": "select",
      "key": "operation",
      "label": "Number comparison",
      "defaultValue": "less_than",
      "options": [
        { "value": "less_than", "label": "A < B" },
        { "value": "less_or_equal", "label": "A ≤ B" },
        { "value": "equal", "label": "A = B" },
        { "value": "not_equal", "label": "A ≠ B" },
        { "value": "greater_or_equal", "label": "A ≥ B" },
        { "value": "greater_than", "label": "A > B" }
      ]
    },
    {
      "type": "hint",
      "text": "Exact equality",
      "visibleWhen": { "key": "operation", "equals": "equal", "orUnset": true }
    }
  ],
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "boolean"
    }
  ]
};
