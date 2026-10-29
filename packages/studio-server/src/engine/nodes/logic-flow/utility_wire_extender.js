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
      "type": "exec"
    },
    {
      "id": "value_in_1",
      "label": "Any Value 1",
      "type": "any"
    }
  ],
  "outputs": [
    {
      "id": "exec_out",
      "label": "Exec Out",
      "type": "exec"
    },
    {
      "id": "value_out_1",
      "label": "Any Value 1",
      "type": "any"
    }
  ]
};
