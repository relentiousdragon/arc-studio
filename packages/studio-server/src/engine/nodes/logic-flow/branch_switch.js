export default {
  "description": "Compares one value with up to 50 cases and runs the first matching branch, or Default when none match.",
  "createdAt": "2026-10-20T16:53:56.000Z",
  "type": "branch_switch",
  "category": "Logic & Flow",
  "label": "Switch / Case",
  "color": "#8b5cf6",
  "dynamicPins": { "kind": "switch-cases", "min": 2, "max": 50 },
  "defaultData": {
    "caseCount": 2,
    "value": "",
    "case_1": "",
    "case_2": ""
  },
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Checks the value against each case in order."
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": "",
      description: "Value compared with the configured cases."
    },
    {
      "id": "case_1",
      "label": "Case 1",
      "type": "string",
      "defaultValue": "",
      description: "First value to compare against the input."
    },
    {
      "id": "case_2",
      "label": "Case 2",
      "type": "string",
      "defaultValue": "",
      description: "Second value to compare against the input."
    }
  ],
  "outputs": [
    {
      "id": "case_1_exec",
      "label": "Case 1",
      "type": "exec",
      description: "Runs when the input matches Case 1."
    },
    {
      "id": "case_2_exec",
      "label": "Case 2",
      "type": "exec",
      description: "Runs when the input matches Case 2."
    },
    {
      "id": "default_exec",
      "label": "Default",
      "type": "exec",
      description: "Runs when no case matches the input."
    }
  ]
};
