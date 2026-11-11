export default {
  "description": "Natural logarithm, non-positive input returns 0",
  "type": "math_log",
  "category": "Math",
  "label": "Natural Log",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Positive number whose natural logarithm to calculate."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Natural logarithm of the input, or zero for non-positive input."
    }
  ]
};
