export default {
  "description": "Changes a server member's nickname or the bot's own nickname",
  "type": "action_set_nickname",
  "category": "Discord Actions",
  "label": "Change Nickname",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Runs Change Nickname."
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      "description": "ID of the server where the nickname should be changed."
    },
    {
      "id": "user_id",
      "label": "User ID (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Target user ID. Leave blank, empty, or @me to change the bot's own nickname."
    },
    {
      "id": "nickname",
      "label": "Nickname",
      "type": "string",
      "defaultValue": "",
      "description": "New nickname up to 32 characters. Leave blank to reset to default."
    },
    {
      "id": "reason",
      "label": "Reason (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Audit log reason for this nickname change."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Continues after Change Nickname completes."
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      "description": "Whether the nickname was changed successfully."
    },
    {
      "id": "nickname",
      "label": "Nickname",
      "type": "string",
      "description": "The applied nickname."
    },
    {
      "id": "member",
      "label": "Member Object",
      "type": "object",
      "description": "Updated guild member data."
    }
  ]
};

