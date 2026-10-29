export default {
  "description": "Constructs a rich Discord embed object",
  "type": "build_embed",
  "category": "Values & Data",
  "label": "Embed Builder",
  "color": "#ec4899",
  "defaultData": {
    "blocks": [],
    "components": []
  },
  "inputs": [
    {
      "id": "title",
      "label": "Title",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "description",
      "label": "Description",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "url",
      "label": "URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "color",
      "label": "Hex Color (#)",
      "type": "string",
      "defaultValue": "#5865F2"
    },
    {
      "id": "author_name",
      "label": "Author",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "author_url",
      "label": "Author URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "author_icon",
      "label": "Author Icon URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "footer_text",
      "label": "Footer Text",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "footer_icon",
      "label": "Footer Icon URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "thumbnail_url",
      "label": "Thumbnail URL",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "image_url",
      "label": "Image URL",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "embed",
      "label": "Embed",
      "type": "embed"
    },
    {
      "id": "components",
      "label": "Components",
      "type": "object"
    }
  ]
};
