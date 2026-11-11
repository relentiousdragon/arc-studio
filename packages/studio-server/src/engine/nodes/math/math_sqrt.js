export default {
  "description": "Returns the non-negative square root, negative input returns 0",
  "type": "math_sqrt",
  "category": "Math",
  "label": "Square Root (√)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Non-negative number whose square root to calculate."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Non-negative square root, or zero for negative input."
    }
  ]
};
