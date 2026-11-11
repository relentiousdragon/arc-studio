export default {
  "description": "True when both inputs are true",
  "introducedAt": "2026-10-16T00:00:00.000Z",
  "type": "logic_and",
  "category": "Logic & Flow",
  "label": "Boolean AND",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "a",
      "label": "A",
      "type": "boolean",
      "defaultValue": false,
      description: "First boolean value to test."
    },
    {
      "id": "b",
      "label": "B",
      "type": "boolean",
      "defaultValue": false,
      description: "Second boolean value to test."
    }
  ],
  "outputs": [
    {
      "id": "result",
      "label": "Result",
      "type": "boolean",
      description: "True only when both inputs are true."
    }
  ]
};
