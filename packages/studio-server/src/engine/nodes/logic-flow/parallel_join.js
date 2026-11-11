export default {
  "description": "Waits for all concurrent branches from one Parallel node, then continues once. For mutually exclusive If/Else paths, connect their exec wires directly to the same action node.",
  "type": "parallel_join",
  "category": "Logic & Flow",
  "label": "Join",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Receives a completed branch from the matching Parallel node.",
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues once every branch has reached this Join node."
    }
  ]
};
