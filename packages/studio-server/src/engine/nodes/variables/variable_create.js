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
      "type": "exec"
    },
    {
      "id": "name",
      "label": "Name",
      "type": "arg",
      "defaultValue": ""
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
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
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg"
    }
  ]
};
