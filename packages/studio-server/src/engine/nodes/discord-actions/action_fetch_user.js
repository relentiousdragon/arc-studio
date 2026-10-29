export default {
  "description": "Fetches a Discord user profile and exposes both the full user object and common profile fields",
  "type": "action_fetch_user",
  "category": "Discord Actions",
  "label": "Get User Info",
  "color": "#10b981",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "user_id",
      "label": "User ID",
      "type": "string",
      "defaultValue": ""
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "user",
      "label": "User Object",
      "type": "object"
    },
    {
      "id": "user_id_out",
      "label": "User ID",
      "type": "string"
    },
    {
      "id": "username",
      "label": "Username",
      "type": "string"
    },
    {
      "id": "global_name",
      "label": "Display Name",
      "type": "string"
    },
    {
      "id": "discriminator",
      "label": "Discriminator",
      "type": "string"
    },
    {
      "id": "avatar",
      "label": "Avatar Hash",
      "type": "string"
    },
    {
      "id": "bot",
      "label": "Is Bot",
      "type": "boolean"
    },
    {
      "id": "public_flags",
      "label": "Public Flags",
      "type": "number"
    }
  ]
};
