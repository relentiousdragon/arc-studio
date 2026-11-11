export default {
  "description": "Base 10 logarithm, non-positive input returns 0",
  "type": "math_log10",
  "category": "Math",
  "label": "Log Base 10",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Positive number whose base 10 logarithm to calculate."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Base 10 logarithm of the input, or zero for non-positive input."
    }
  ]
};
