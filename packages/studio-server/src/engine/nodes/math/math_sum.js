export default {
  "description": "Adds up to 50 values. Connect the last input to reveal another.",
  "type": "math_sum",
  "category": "Math",
  "label": "Sum",
  "color": "#38bdf8",
  "dynamicPins": { "kind": "math-list", "baseIds": ["a", "b", "c", "d"], "extraPrefix": "value_", "extraLabel": "Value", "type": "number", "defaultValue": 0, "min": 2, "max": 50 },
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0,
      description: "First number included in the sum."
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0,
      description: "Second number included in the sum."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number",
      description: "Sum of the connected numbers."
    }
  ]
};
