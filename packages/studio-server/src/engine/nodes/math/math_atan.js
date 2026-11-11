export default {
  "description": "Inverse tangent, returned in radians",
  "type": "math_atan",
  "category": "Math",
  "label": "Arctangent",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Tangent value to convert to an angle in radians."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Angle in radians whose tangent is the input."
    }
  ]
};
