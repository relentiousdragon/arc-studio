export default {
  "description": "Updates specific fields on an existing embed without rebuilding it",
  "type": "modify_embed",
  "category": "Values & Data",
  "label": "Modify Embed",
  "color": "#ec4899",
  "inputs": [
    {
      "id": "embed",
      "label": "Base Embed",
      "type": "embed",
      description: "Embed to copy and update."
    },
    {
      "id": "title",
      "label": "Title (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement title."
    },
    {
      "id": "description",
      "label": "Description (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement description."
    },
    {
      "id": "color",
      "label": "Hex Color (#, optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement hex color."
    },
    {
      "id": "image_url",
      "label": "Image URL (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement image URL."
    },
    {
      "id": "thumbnail_url",
      "label": "Thumbnail URL (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement thumbnail URL."
    },
    {
      "id": "footer_text",
      "label": "Footer Text (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement footer text."
    },
    {
      "id": "author_name",
      "label": "Author Name (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional replacement author name."
    },
    {
      "id": "field_name",
      "label": "Field Name (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional field name to add or update."
    },
    {
      "id": "field_value",
      "label": "Field Value (Optional)",
      "type": "string",
      "defaultValue": "",
      description: "Optional field value to add or update."
    }
  ],
  "outputs": [
    {
      "id": "embed",
      "label": "Embed",
      "type": "embed",
      description: "Updated embed with the selected fields changed."
    }
  ]
};
