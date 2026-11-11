export default {
  "description": "Splits execution flow based on a boolean condition",
  "type": "branch_if",
  "category": "Logic & Flow",
  "label": "Branch (If / Else)",
  "color": "#8b5cf6",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Evaluates the condition and selects an execution branch."
    },
    {
      "id": "condition",
      "label": "Condition",
      "type": "boolean",
      "defaultValue": false,
      description: "Boolean value used to choose the True or False branch."
    }
  ],
  "outputs": [
    {
      "id": "true_exec",
      "label": "True",
      "type": "exec",
      description: "Runs when the condition is true."
    },
    {
      "id": "false_exec",
      "label": "False",
      "type": "exec",
      description: "Runs when the condition is false."
    }
  ]
};
