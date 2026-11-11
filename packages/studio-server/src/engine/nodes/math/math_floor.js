export default {
  "description": "Rounds down to an integer",
  "type": "math_floor",
  "category": "Math",
  "label": "Floor",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number to round down to the next integer."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Input rounded down to an integer."
    }
  ]
};
