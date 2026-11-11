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
      "defaultValue": "",
      description: "Message text to check and parse."
    },
    {
      "id": "prefix",
      "label": "Prefix",
      "type": "string",
      "defaultValue": "!",
      description: "Prefix that marks the start of a command."
    }
  ],
  "outputs": [
    {
      "id": "recognized",
      "label": "Recognized",
      "type": "boolean",
      description: "True when the message starts with the prefix and contains a command."
    },
    {
      "id": "command",
      "label": "Command",
      "type": "string",
      description: "Command name after the prefix."
    },
    {
      "id": "arguments",
      "label": "Arguments",
      "type": "object",
      description: "Whitespace-separated command arguments."
    },
    {
      "id": "argument_count",
      "label": "Argument Count",
      "type": "number",
      description: "Number of parsed arguments."
    }
  ]
};
