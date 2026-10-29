export default {
  "description": "Fires for every new message. Use Split Text to break message content into parts.",
  "type": "event_message_create",
  "dynamicPins": { "kind": "connected-output-arguments", "prefix": "argument_", "label": "Legacy Argument {index}", "type": "string", "max": 50 },
  "category": "Events",
  "label": "On Message Create",
  "color": "#5865F2",
  "gatewayEvent": "MESSAGE_CREATE",
  "gatewayIntents": [
    "GUILDS",
    "GUILD_MESSAGES",
    "DIRECT_MESSAGES",
    "MESSAGE_CONTENT"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "message",
      "label": "Message Object",
      "type": "object",
      "eventPath": "$"
    },
    {
      "id": "message_id",
      "label": "Message ID",
      "type": "string",
      "eventPath": "id"
    },
    {
      "id": "content",
      "label": "Message Content",
      "type": "string"
    },
    {
      "id": "author_id",
      "label": "Author ID",
      "type": "string"
    },
    {
      "id": "author_name",
      "label": "Author Name",
      "type": "string"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string"
    },
    {
      "id": "is_bot",
      "label": "Is Bot",
      "type": "boolean"
    },
    {
      "id": "has_mentions",
      "label": "Has Mentions",
      "type": "boolean"
    },
    {
      "id": "mentions",
      "label": "Mentioned Users",
      "type": "object",
      "eventPath": "mentions"
    },
    {
      "id": "mention_roles",
      "label": "Mentioned Roles",
      "type": "object",
      "eventPath": "mention_roles"
    },
    {
      "id": "mention_everyone",
      "label": "Mentions Everyone",
      "type": "boolean",
      "eventPath": "mention_everyone"
    },
    {
      "id": "is_reply",
      "label": "Is Reply",
      "type": "boolean"
    },
    {
      "id": "referenced_message_id",
      "label": "Replied Message ID",
      "type": "string",
      "eventPath": "message_reference.message_id"
    },
    {
      "id": "reply_author_id",
      "label": "Replied Author ID",
      "type": "string",
      "eventPath": "referenced_message.author.id"
    }
  ]
};
