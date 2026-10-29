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
      "type": "exec"
    },
    {
      "id": "value",
      "label": "Value",
      "type": "arg",
      "defaultValue": ""
    },
    {
      "id": "case_1",
      "label": "Case 1",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "case_2",
      "label": "Case 2",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "case_1_exec",
      "label": "Case 1",
      "type": "exec"
    },
    {
      "id": "case_2_exec",
      "label": "Case 2",
      "type": "exec"
    },
    {
      "id": "default_exec",
      "label": "Default",
      "type": "exec"
    }
  ]
};
