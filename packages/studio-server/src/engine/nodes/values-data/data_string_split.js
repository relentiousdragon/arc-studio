export default {
  "description": "Splits text at each exact separator string. Connect Part 1, Part 2, and more as needed, each used output reveals the next socket. It does not parse command prefixes or quoted arguments.",
  "type": "data_string_split",
  "dynamicPins": { "kind": "indexed-outputs", "prefix": "part_", "label": "Part {index}", "type": "string", "min": 1, "max": 50 },
  "category": "Values & Data",
  "label": "Split Text",
  "color": "#06b6d4",
  "inputs": [
    {
      "id": "text",
      "label": "Text",
      "type": "string",
      "defaultValue": "",
      description: "Text to split."
    },
    {
      "id": "separator",
      "label": "Separator",
      "type": "string",
      "defaultValue": ",",
      description: "Exact text separator to split at."
    }
  ],
  "outputs": [
    {
      "id": "array",
      "label": "Parts",
      "type": "object",
      description: "Parts of the input text in order."
    },
    {
      "id": "length",
      "label": "Count",
      "type": "number",
      description: "Number of parts created."
    }
  ]
};
