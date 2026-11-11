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
      "defaultValue": 0,
      description: "Lowest possible random value."
    },
    {
      "id": "max",
      "label": "Maximum",
      "type": "number",
      "defaultValue": 1,
      description: "Highest possible random value."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Random number between the minimum and maximum."
    }
  ]
};
