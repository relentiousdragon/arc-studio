export default {
  "description": "Returns a random number between the connected minimum and maximum",
  "type": "math_random",
  "category": "Math",
  "label": "Random Number",
  "color": "#38bdf8",
  "inputs": [
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
