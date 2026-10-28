export default {
  "description": "Builds structured channel access rules. Choose a role or member, then select which channel permissions it can allow or deny.",
  "type": "data_permission_overwrites",
  "category": "Values & Data",
  "label": "Channel Permission Overwrites",
  "color": "#06b6d4",
  "dynamicPins": { "kind": "permission-overwrites", "max": 100 },
  "defaultData": {
    "overwriteCount": 1,
    "target_id_1": "",
    "target_type_1": 0,
    "allow_1": [],
    "deny_1": []
  },
  "inputs": [
    {
      "id": "target_id_1",
      "label": "Target ID 1",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "overwrites",
      "label": "Overwrites",
      "type": "object"
    }
  ]
};
