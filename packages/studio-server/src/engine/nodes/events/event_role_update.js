export default {
  "description": "A role is updated",
  "type": "event_role_update",
  "category": "Events",
  "label": "On Role Updated",
  "color": "#5865F2",
  "gatewayEvent": "GUILD_ROLE_UPDATE",
  "gatewayIntents": [
    "GUILDS"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a role is updated."},
    {
      "id": "role_id",
      "label": "Role ID",
      "type": "string",
      "eventPath": "role.id",
      description: "ID of the role tied to this event."},
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
      "eventPath": "role.name",
      description: "Current name of the event target."},
    {
      "id": "color",
      "label": "Color",
      "type": "number",
      "eventPath": "role.color",
      description: "Role color as an RGB value."},
    {
      "id": "hoist",
      "label": "Show Separately",
      "type": "boolean",
      "eventPath": "role.hoist",
      description: "Whether the role has its own member list."},
    {
      "id": "position",
      "label": "Position",
      "type": "number",
      "eventPath": "role.position",
      description: "Role position in the server."},
    {
      "id": "permissions",
      "label": "Permissions",
      "type": "string",
      "eventPath": "role.permissions",
      description: "Role permission bitfield."},
    {
      "id": "managed",
      "label": "Managed",
      "type": "boolean",
      "eventPath": "role.managed",
      description: "Whether an integration manages this role."},
    {
      "id": "mentionable",
      "label": "Mentionable",
      "type": "boolean",
      "eventPath": "role.mentionable",
      description: "Whether members can mention this role."},
    {
      "id": "icon",
      "label": "Icon",
      "type": "string",
      "eventPath": "role.icon",
      description: "Role icon hash, if set."},
    {
      "id": "unicode_emoji",
      "label": "Unicode Emoji",
      "type": "string",
      "eventPath": "role.unicode_emoji",
      description: "Role emoji, if set."},
    {
      "id": "flags",
      "label": "Flags",
      "type": "number",
      "eventPath": "role.flags",
      description: "Role flags bitfield."},
    {
      "id": "tags",
      "label": "Tags",
      "type": "object",
      "eventPath": "role.tags",
      description: "Integration and subscription role tags."}
  ]
};
