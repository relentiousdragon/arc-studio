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
      "type": "variable",
      description: "Variable to read."
    }
  ],
  "outputs": [
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable",
      description: "Reference to the variable that was read."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "string",
      description: "Current value stored in the variable."
    }
  ]
};
