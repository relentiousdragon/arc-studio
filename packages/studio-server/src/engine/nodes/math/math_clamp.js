export default {
  "description": "Restricts a value between a minimum and maximum",
  "type": "math_clamp",
  "category": "Math",
  "label": "Clamp",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "min",
      "label": "Minimum",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "max",
      "label": "Maximum",
      "type": "number",
      "defaultValue": 1
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number"
    }
  ]
};
