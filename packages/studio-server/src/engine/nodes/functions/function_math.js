export default {
  "description": "Legacy arithmetic node. Use the Math nodes for new graphs.",
  "hidden": true,
  "type": "function_math",
  "category": "Functions",
  "label": "Calculate",
  "color": "#a78bfa",
  "defaultData": {
    "operation": "add"
  },
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "number",
      "defaultValue": 0
    },
    {
      "id": "b",
      "label": "B",
      "type": "number",
      "defaultValue": 0
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "number"
    }
  ]
};
