export default {
  "description": "Reads a graph variable as typed data",
  "type": "variable_get",
  "category": "Variables",
  "label": "Get Variable",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable"
    }
  ],
  "outputs": [
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable"
    },
    {
      "id": "value",
      "label": "Value",
      "type": "string"
    }
  ]
};
