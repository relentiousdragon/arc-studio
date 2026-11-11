export default {
  "description": "Inverts a boolean value",
  "introducedAt": "2026-10-16T00:00:00.000Z",
  "type": "logic_not",
  "category": "Logic & Flow",
  "label": "Boolean NOT",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "value",
      "label": "Value",
      "type": "boolean",
      "defaultValue": false,
      description: "Boolean value to invert."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "boolean",
      description: "The opposite of the input boolean."
    }
  ]
};
