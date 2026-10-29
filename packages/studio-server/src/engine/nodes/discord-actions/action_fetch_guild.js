export default {
  "description": "Fetches a Discord server and exposes its full server object, owner, features, and common settings",
  "type": "action_fetch_guild",
  "category": "Discord Actions",
  "label": "Get Server Info",
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
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec"
    },
    {
      "id": "guild",
      "label": "Server Object",
      "type": "object"
    },
    {
      "id": "guild_id_out",
      "label": "Server ID",
      "type": "string"
    },
    {
      "id": "name",
      "label": "Name",
      "type": "string"
    },
    {
      "id": "owner_id",
      "label": "Owner ID",
      "type": "string"
    },
    {
      "id": "description",
      "label": "Description",
      "type": "string"
    },
    {
      "id": "icon",
      "label": "Icon Hash",
      "type": "string"
    },
    {
      "id": "member_count",
      "label": "Approx. Members",
      "type": "number"
    },
    {
      "id": "features",
      "label": "Features",
      "type": "object"
    },
    {
      "id": "preferred_locale",
      "label": "Preferred Locale",
      "type": "string"
    },
    {
      "id": "verification_level",
      "label": "Verification Level",
      "type": "number"
    }
  ]
};
