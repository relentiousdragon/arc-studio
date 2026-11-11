export default {
  "description": "Updates a graph variable during execution",
  "type": "variable_set",
  "category": "Variables",
  "label": "Set Variable",
  "color": "#38bdf8",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts updating the variable."
    },
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable",
      description: "Variable to update."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "string",
      "defaultValue": "",
      description: "New value to store in the variable."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the variable is updated."
    },
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable",
      description: "Reference to the updated variable."
    }
  ]
};
