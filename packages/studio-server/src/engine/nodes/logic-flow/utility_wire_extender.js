export default {
  "description": "Passes execution or any typed data value straight through. Use it to route wires neatly around a busy canvas.",
  "introducedAt": "2026-10-16T00:00:00.000Z",
  "type": "utility_wire_extender",
  "dynamicPins": { "kind": "wire-extender", "max": 7 },
  "category": "Logic & Flow",
  "label": "Wire Extender",
  "color": "#a78bfa",
  "inputs": [
    {
      "id": "exec_in",
      "label": "Exec In",
      "type": "exec",
      description: "Execution flow to pass through the node."
    },
    {
      "id": "value_in_1",
      "label": "Any Value 1",
      "type": "any",
      description: "Any typed data value to pass through the node."
    }
  ],
  "outputs": [
    {
      "id": "exec_out",
      "label": "Exec Out",
      "type": "exec",
      description: "Execution flow passed through unchanged."
    },
    {
      "id": "value_out_1",
      "label": "Any Value 1",
      "type": "any",
      description: "Data value passed through unchanged."
    }
  ]
};
