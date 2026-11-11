export default {
  "description": "A channel is updated",
  "type": "event_channel_update",
  "category": "Events",
  "label": "On Channel Updated",
  "color": "#5865F2",
  "gatewayEvent": "CHANNEL_UPDATE",
  "gatewayIntents": [
    "GUILDS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a channel is updated."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name",
      description: "Current name of the event target."},
    {
      "id": "channel_type",
      "label": "Channel Type",
      "type": "number",
      "eventPath": "type",
      description: "Discord channel type value."},
    {
      "id": "parent_id",
      "label": "Category ID",
      "type": "string",
      "eventPath": "parent_id",
      description: "ID of the parent channel or category."},
    {
      "id": "topic",
      "label": "Topic",
      "type": "string",
      "eventPath": "topic",
      description: "Channel topic, if set."},
    {
      "id": "position",
      "label": "Position",
      "type": "number",
      "eventPath": "position",
      description: "Channel position in the server."},
    {
      "id": "nsfw",
      "label": "NSFW",
      "type": "boolean",
      "eventPath": "nsfw",
      description: "Whether the channel is age restricted."},
    {
      "id": "rate_limit_per_user",
      "label": "Slowmode",
      "type": "number",
      "eventPath": "rate_limit_per_user",
      description: "Slowmode delay in seconds."},
    {
      "id": "permission_overwrites",
      "label": "Permission Overwrites",
      "type": "array",
      "eventPath": "permission_overwrites",
      description: "Channel-specific permission rules."}
  ]
};
