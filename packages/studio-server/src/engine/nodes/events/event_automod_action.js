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
      "type": "exec",
      description: "Runs when AutoMod takes action on content."},
    {
      "id": "rule_id",
      "label": "Rule ID",
      "type": "string",
      "eventPath": "rule_id",
      description: "ID of the AutoMod rule that matched."},
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "eventPath": "user_id",
      description: "ID of the user who triggered or was affected by the event."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "action_type",
      "label": "Action Type",
      "type": "number",
      "eventPath": "action.type",
      description: "Discord audit log action type value."},
    {
      "id": "keyword",
      "label": "Matched Keyword",
      "type": "string",
      "eventPath": "matched_keyword",
      description: "Keyword that triggered the AutoMod rule."}
  ]
};
