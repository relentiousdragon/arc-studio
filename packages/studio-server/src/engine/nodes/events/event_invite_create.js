export default {
  "description": "An invite is created",
  "type": "event_invite_create",
  "category": "Events",
  "label": "On Invite Created",
  "color": "#5865F2",
  "gatewayEvent": "INVITE_CREATE",
  "gatewayIntents": [
    "GUILD_INVITES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "code",
      "label": "Invite Code",
      "type": "string",
      "eventPath": "code"
    },
    {
      "id": "channel_id",
      "label": "Channel ID",
      "type": "string",
      "eventPath": "channel_id"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id"
    },
    {
      "id": "inviter_id",
      "label": "Inviter ID",
      "type": "string",
      "eventPath": "inviter.id"
    }
  ]
};
