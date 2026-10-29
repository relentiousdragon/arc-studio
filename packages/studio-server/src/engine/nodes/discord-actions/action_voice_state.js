export default {
  "description": "Requests a Gateway voice-state change. Joining does not create an audio connection or play audio.",
  "type": "action_voice_state",
  "category": "Discord Actions",
  "label": "Request Voice Join / Leave",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "channel_id",
      "label": "Voice Channel ID (blank leaves)",
      "type": "string",
      "defaultValue": ""
    },
    {
      "id": "self_mute",
      "label": "Self Mute",
      "type": "boolean",
      "defaultValue": false
    },
    {
      "id": "self_deaf",
      "label": "Self Deafen",
      "type": "boolean",
      "defaultValue": false
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    }
  ]
};
