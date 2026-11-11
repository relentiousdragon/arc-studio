export default {
  "description": "Returns one or more named values from this function graph",
  "type": "function_return",
  "dynamicPins": { "kind": "function-return-values", "version": 1 },
  "category": "Functions",
  "label": "Return Value",
  "color": "#a78bfa",
  "defaultData": {
    "returns": [{ "returnId": "output_1", "name": "Result", "valueType": "number", "defaultValue": 0 }]
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Returns values from this function graph."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "number",
      "defaultValue": 0,
      description: "Value returned to the calling function node."
    }
  ],
  "outputs": []
};
