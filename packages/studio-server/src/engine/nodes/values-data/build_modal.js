export default {
  "description": "Builds a Discord modal with 1–5 labeled inputs, selects, or checkbox groups.",
  "type": "build_modal",
  "category": "Values & Data",
  "label": "Popup Modal Builder",
  "color": "#06b6d4",
  "defaultData": {
    "modal": {
      "customId": "arc_modal",
      "title": "Tell us more",
      "components": [
        {
          "type": "text",
          "customId": "details",
          "label": "Details",
          "style": 2,
          "required": true,
          "minLength": 1,
          "maxLength": 1000
        }
      ]
    }
  },
  "inputs": [],
  "outputs": [
    {
      "id": "modal",
      "label": "Modal",
      "type": "object"
    }
  ]
};
