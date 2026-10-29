export default {
  "description": "AutoMod takes action on content",
  "type": "event_automod_action",
  "category": "Events",
  "label": "On AutoMod Action",
  "color": "#5865F2",
  "gatewayEvent": "AUTO_MODERATION_ACTION_EXECUTION",
  "gatewayIntents": [
    "AUTO_MODERATION_EXECUTION"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "rule_id",
      "label": "Rule ID",
      "type": "string",
      "eventPath": "rule_id"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "action_type",
      "label": "Action Type",
      "type": "number",
      "eventPath": "action.type"
    },
    {
      "id": "keyword",
      "label": "Matched Keyword",
      "type": "string",
      "eventPath": "matched_keyword"
    }
  ]
};
