export default {
  "description": "Creates or updates a graph variable. Its value type follows the connected value, otherwise choose a type and fallback value.",
  "type": "variable_create",
  "category": "Variables",
  "label": "Create Variable",
  "color": "#38bdf8",
  "defaultData": {
    "name": "",
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
