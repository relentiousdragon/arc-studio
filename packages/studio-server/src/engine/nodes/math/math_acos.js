export default {
  "description": "Inverse cosine, returned in radians",
  "type": "math_acos",
  "category": "Math",
  "label": "Arccosine",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Cosine value to convert to an angle in radians."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Angle in radians whose cosine is the input."
    }
  ]
};
