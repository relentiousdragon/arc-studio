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
      "type": "exec",
      description: "Starts Get Server Info."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "defaultValue": "",
      description: "ID of the server to fetch."}
  ],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Continues after Get Server Info completes."},
    {
      "id": "guild",
      "label": "Server Object",
      "type": "object",
      description: "Full server record returned by Discord."},
    {
      "id": "guild_id_out",
      "label": "Server ID",
      "type": "string",
      description: "ID of the returned server."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      description: "Name to assign."},
    {
      "id": "owner_id",
      "label": "Owner ID",
      "type": "string",
      description: "ID of the server owner."},
    {
      "id": "description",
      "label": "Description",
      "type": "string",
      description: "Description to assign."},
    {
      "id": "icon",
      "label": "Icon Hash",
      "type": "string",
      description: "Icon hash for the returned server."},
    {
      "id": "member_count",
      "label": "Approx. Members",
      "type": "number",
      description: "Approximate number of server members."},
    {
      "id": "features",
      "label": "Features",
      "type": "object",
      description: "Features enabled for the server."},
    {
      "id": "preferred_locale",
      "label": "Preferred Locale",
      "type": "string",
      description: "Preferred locale for the server."},
    {
      "id": "verification_level",
      "label": "Verification Level",
      "type": "number",
      description: "Server verification level value."},
    {
      "id": "success",
      "label": "Success",
      "type": "boolean",
      description: "Whether the action completed successfully."}
  ]
};
