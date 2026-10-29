export default {
  "description": "Waits for both branches from one Parallel node, then continues once. For mutually exclusive If/Else paths, connect their exec wires directly to the same action node.",
  "type": "parallel_join",
  "category": "Logic & Flow",
  "label": "Join",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ]
};
