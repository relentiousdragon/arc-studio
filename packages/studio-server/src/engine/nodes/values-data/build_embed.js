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
      "defaultValue": "",
      description: "Embed title text."
    },
    {
      "id": "description",
      "label": "Description",
      "type": "string",
      "defaultValue": "",
      description: "Main description text for the embed."
    },
    {
      "id": "url",
      "label": "URL",
      "type": "string",
      "defaultValue": "",
      description: "URL opened when the title is clicked."
    },
    {
      "id": "color",
      "label": "Hex Color (#)",
      "type": "string",
      "defaultValue": "#5865F2",
      description: "Embed accent color as a hex value."
    },
    {
      "id": "author_name",
      "label": "Author",
      "type": "string",
      "defaultValue": "",
      description: "Author name shown above the description."
    },
    {
      "id": "author_url",
      "label": "Author URL",
      "type": "string",
      "defaultValue": "",
      description: "URL opened when the author name is clicked."
    },
    {
      "id": "author_icon",
      "label": "Author Icon URL",
      "type": "string",
      "defaultValue": "",
      description: "URL of the author icon image."
    },
    {
      "id": "footer_text",
      "label": "Footer Text",
      "type": "string",
      "defaultValue": "",
      description: "Footer text shown at the bottom."
    },
    {
      "id": "footer_icon",
      "label": "Footer Icon URL",
      "type": "string",
      "defaultValue": "",
      description: "URL of the footer icon image."
    },
    {
      "id": "thumbnail_url",
      "label": "Thumbnail URL",
      "type": "string",
      "defaultValue": "",
      description: "URL of the thumbnail image."
    },
    {
      "id": "image_url",
      "label": "Image URL",
      "type": "string",
      "defaultValue": "",
      description: "URL of the main embed image."
    }
  ],
  "outputs": [
    {
      "id": "embed",
      "label": "Embed",
      "type": "embed",
      description: "Built Discord embed object."
    },
    {
      "id": "components",
      "label": "Components",
      "type": "object",
      description: "Message components attached to the embed."
    }
  ]
};
