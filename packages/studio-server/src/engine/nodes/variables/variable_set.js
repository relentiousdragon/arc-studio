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
      "type": "exec"
    },
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable"
    },
    {
      "id": "value",
      "label": "Value",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable"
    }
  ]
};
