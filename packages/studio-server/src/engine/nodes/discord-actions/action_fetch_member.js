export default {
  "description": "Fetches a member in a server and exposes the full member and user objects, roles, and profile fields",
  "type": "action_fetch_member",
  "category": "Discord Actions",
  "label": "Get Server Member",
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
      "id": "member",
      "label": "Member Object",
      "type": "object"
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
      "id": "nickname",
      "label": "Nickname",
      "type": "string"
    },
    {
      "id": "roles",
      "label": "Role IDs",
      "type": "object"
    },
    {
      "id": "joined_at",
      "label": "Joined At",
      "type": "string"
    },
    {
      "id": "premium_since",
      "label": "Boosted Since",
      "type": "string"
    },
    {
      "id": "deaf",
      "label": "Server Deafened",
      "type": "boolean"
    },
    {
      "id": "mute",
      "label": "Server Muted",
      "type": "boolean"
    },
    {
      "id": "pending",
      "label": "Membership Pending",
      "type": "boolean"
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean"
    }
  ]
};
