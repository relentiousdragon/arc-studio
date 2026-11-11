export default {
  "description": "Inverse sine, returned in radians",
  "type": "math_asin",
  "category": "Math",
  "label": "Arcsine",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Sine value to convert to an angle in radians."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Angle in radians whose sine is the input."
    }
  ]
};
