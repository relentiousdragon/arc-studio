export default {
  "description": "Runs multiple execution branches concurrently. All branches must connect to the same Join node before execution continues.",
  "type": "parallel",
  "category": "Logic & Flow",
  "label": "Parallel",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Starts all connected branches concurrently."
    }
  ],
  "outputs": [
    {
      "id": "branch_a_exec",
      "label": "Branch 1",
      "type": "exec",
      description: "Starts the first concurrent branch."
    },
    {
      "id": "branch_b_exec",
      "label": "Branch 2",
      "type": "exec",
      description: "Starts the second concurrent branch."
    }
  ]
};
