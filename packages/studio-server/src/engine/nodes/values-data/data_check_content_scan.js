export default {
  description: 'Checks a Discord Message object for explicit, gore, or self-harm content scan flags on attachments, embeds, and Components V2 media. Flags may arrive later in On Message Updated, so missing flags do not mean the message is safe.',
  type: 'data_check_content_scan',
  category: 'Values & Data',
  label: 'Check Content Scan',
  color: '#06b6d4',
  inputs: [
    { id: 'message', label: 'Message', type: 'object', defaultValue: {}, description: "Discord message whose attachments, embeds, and media to check." }
  ],
  outputs: [
    { id: 'contains_explicit', label: 'Contains Explicit Content', type: 'boolean', description: "True when an item has an explicit content scan flag." },
    { id: 'contains_gore', label: 'Contains Gore Content', type: 'boolean', description: "True when an item has a gore content scan flag." },
    { id: 'contains_self_harm', label: 'Contains Self-Harm Content', type: 'boolean', description: "True when an item has a self-harm content scan flag." },
    { id: 'contains_flagged_content', label: 'Contains Flagged Content', type: 'boolean', description: "True when any checked item has a content scan flag." },
    { id: 'scan_metadata_present', label: 'Scan Metadata Present', type: 'boolean', description: "True when scan metadata is available on the message." },
    { id: 'scanned_item_count', label: 'Items With Scan Flags', type: 'number', description: "Number of items with scan metadata." },
    { id: 'flagged_item_count', label: 'Flagged Items', type: 'number', description: "Number of items with one or more scan flags." },
    { id: 'findings', label: 'Findings', type: 'array', description: "Details for each item with scan metadata." }
  ]
};