export default {
  "description": "Modifies the bot's server-specific profile including nickname, avatar, banner, and bio",
  "type": "action_modify_server_profile",
  "category": "Discord Actions",
  "label": "Change Server Profile",
  "color": "#f59e0b",
  "inputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Runs Change Server Profile."
    },
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      "description": "ID of the server where the profile should be updated."
    },
    {
      "id": "nickname",
      "label": "Nickname (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Server nickname up to 32 characters."
    },
    {
      "id": "avatar",
      "label": "Avatar (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Server avatar image URL, project media path, or base64 data URI."
    },
    {
      "id": "banner",
      "label": "Banner (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Server banner image URL, project media path, or base64 data URI."
    },
    {
      "id": "bio",
      "label": "Bio (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "About Me bio for server profile up to 190 characters."
    },
    {
      "id": "clear_avatar",
      "label": "Clear Avatar",
      "type": "boolean",
      "defaultValue": false,
      "description": "Remove the custom server avatar."
    },
    {
      "id": "clear_banner",
      "label": "Clear Banner",
      "type": "boolean",
      "defaultValue": false,
      "description": "Remove the custom server banner."
    },
    {
      "id": "clear_bio",
      "label": "Clear Bio",
      "type": "boolean",
      "defaultValue": false,
      "description": "Remove the custom server bio."
    },
    {
      "id": "reason",
      "label": "Reason (Optional)",
      "type": "string",
      "defaultValue": "",
      "description": "Audit log reason for this profile change."
    }
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      "description": "Continues after Change Server Profile completes."
    },
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      "description": "Whether the server profile was updated successfully."
    },
    {
      "id": "nickname",
      "label": "Nickname",
      "type": "string",
      "description": "Applied server nickname."
    },
    {
      "id": "bio",
      "label": "Bio",
      "type": "string",
      "description": "Applied server bio."
    },
    {
      "id": "member",
      "label": "Member Object",
      "type": "object",
      "description": "Updated guild member profile data."
    }
  ]
};

