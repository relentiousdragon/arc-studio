export default {
  "description": "Returns the distance from zero",
  "type": "math_abs",
  "category": "Math",
  "label": "Absolute (abs)",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Number whose distance from zero to return."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Non-negative distance of the input from zero."
    }
  ]
};
