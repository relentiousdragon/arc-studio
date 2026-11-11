export default {
  "description": "Creates a graph or project variable when the graph runs. An existing variable with the same name is left untouched.",
  "type": "variable_create",
  "category": "Variables",
  "label": "Create Variable",
  "color": "#38bdf8",
  "defaultData": {
    "name": "",
    "scope": "graph",
    "valueType": "string",
    "value": "",
    "persist": true
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts variable creation."
    },
    {
      "id": "name",
      "label": "Name",
      "type": "arg",
      "defaultValue": "",
      description: "Name for the new graph or project variable."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": "",
      description: "Initial value assigned when the variable is created."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after the variable is available."
    },
    {
      "id": "variable",
      "label": "Variable",
      "type": "variable",
      description: "Reference to the created or existing variable."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      description: "Initial value of the created variable."
    }
  ]
};
