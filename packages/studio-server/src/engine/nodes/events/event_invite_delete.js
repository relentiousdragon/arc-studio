export default {
  "description": "An invite is deleted",
  "type": "event_invite_delete",
  "category": "Events",
  "label": "On Invite Deleted",
  "color": "#5865F2",
  "gatewayEvent": "INVITE_DELETE",
  "gatewayIntents": [
    "GUILD_INVITES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when an invite is deleted."},
    {
      "id": "code",
      "label": "Invite Code",
      "type": "string",
      "eventPath": "code",
      description: "Invite code."},
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id",
      description: "ID of the channel where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."}
  ]
};
