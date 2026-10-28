export default {
  "description": "Checks for a prefix, extracts the command, and parses whitespace-separated arguments. Quoted arguments can contain spaces.",
  "type": "data_parse_prefix_command",
  "dynamicPins": { "kind": "indexed-outputs", "prefix": "argument_", "label": "Argument {index}", "type": "string", "min": 1, "max": 50 },
  "category": "Values & Data",
  "label": "Parse Prefix Command",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "content",
      "label": "Message Content",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "prefix",
      "label": "Prefix",
      "type": "string",
      "defaultValue": "!"
    }
  ],
  "outputs": [
    {
      "id": "recognized",
      "label": "Recognized",
      "type": "boolean"
    },
    {
      "id": "command",
      "label": "Command",
      "type": "string"
    },
    {
      "id": "arguments",
      "label": "Arguments",
      "type": "object"
    },
    {
      "id": "argument_count",
      "label": "Argument Count",
      "type": "number"
    }
  ]
};
