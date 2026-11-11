export default {
  "description": "A thread is created",
  "type": "event_thread_create",
  "category": "Events",
  "label": "On Thread Created",
  "color": "#5865F2",
  "gatewayEvent": "THREAD_CREATE",
  "gatewayIntents": [
    "GUILD_MESSAGES"
  ],
  "inputs": [],
  "outputs": [
    {
      "id": "exec",
      "label": "Exec",
      "type": "exec",
      description: "Runs when a thread is created."},
    {
      "id": "thread_id",
      "label": "Thread ID",
      "type": "string",
      "eventPath": "id",
      description: "ID of the thread where the event occurred."},
    {
      "id": "guild_id",
      "label": "Server ID",
      "type": "string",
      "eventPath": "guild_id",
      description: "ID of the server where the event occurred."},
    {
      "id": "parent_id",
      "label": "Parent Channel ID",
      "type": "string",
      "eventPath": "parent_id",
      description: "ID of the parent channel or category."},
    {
      "id": "name",
      "label": "Name",
      "type": "string",
      "eventPath": "name",
      description: "Current name of the event target."},
    {
      "id": "channel_type",
      "label": "Channel Type",
      "type": "number",
      "eventPath": "type",
      description: "Discord channel type value."},
    {
      "id": "owner_id",
      "label": "Owner ID",
      "type": "string",
      "eventPath": "owner_id",
      description: "ID of the thread creator."},
    {
      "id": "message_count",
      "label": "Message Count",
      "type": "number",
      "eventPath": "message_count",
      description: "Messages in the thread."},
    {
      "id": "member_count",
      "label": "Member Count",
      "type": "number",
      "eventPath": "member_count",
      description: "Members in the thread."},
    {
      "id": "auto_archive_duration",
      "label": "Auto Archive",
      "type": "number",
      "eventPath": "auto_archive_duration",
      description: "Minutes before the thread is archived."}
  ]
};
