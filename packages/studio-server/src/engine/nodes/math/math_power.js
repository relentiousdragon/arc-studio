export default {
  "description": "Raises A to the power of B",
  "type": "math_power",
  "category": "Math",
  "label": "Power (^)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "Number to raise to a power."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Exponent to raise A by."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "A raised to the power of B."
    }
  ]
};
