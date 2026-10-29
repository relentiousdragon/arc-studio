export default {
  "description": "Runs another event graph for the same Discord event. The target must have a matching event node, graph cycles are rejected.",
  "type": "execute_graph",
  "category": "Logic & Flow",
  "label": "Run Event Graph",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
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
