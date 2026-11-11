export default {
  "description": "Rounds up to an integer",
  "type": "math_ceil",
  "category": "Math",
  "label": "Ceiling",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number to round up to the next integer."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Input rounded up to an integer."
    }
  ]
};
