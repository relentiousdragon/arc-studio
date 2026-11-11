export default {
  "description": "Rounds to the selected decimal places",
  "type": "math_round",
  "category": "Math",
  "label": "Round",
  "color": "#38bdf8",
  "editorControls": [
    {
      "type": "number",
      "key": "precision",
      "label": "Decimal places",
      "defaultValue": 0,
      "min": 0,
      "max": 12,
      "step": 1,
      "integer": true
    }
  ],
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number to round to the selected decimal places."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Input rounded to the selected decimal places."
    }
  ]
};
