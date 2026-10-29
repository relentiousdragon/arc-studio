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
      "type": "embed"
    },
    {
      "id": "title",
      "label": "Title (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "description",
      "label": "Description (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "color",
      "label": "Hex Color (#, optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "image_url",
      "label": "Image URL (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "thumbnail_url",
      "label": "Thumbnail URL (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "footer_text",
      "label": "Footer Text (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "author_name",
      "label": "Author Name (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "field_name",
      "label": "Field Name (Optional)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "field_value",
      "label": "Field Value (Optional)",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "embed",
      "label": "Embed",
      "type": "embed"
    }
  ]
};
