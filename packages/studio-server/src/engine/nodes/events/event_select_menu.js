export default {
  description: 'A select menu is submitted',
  type: 'event_select_menu',
  category: 'Events',
  label: 'On Select Menu Used',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayIntents: [],
  gatewayInteractionType: 3,
  gatewayComponentTypes: [
    3,
    5,
    6,
    7,
    8
  ],
  defaultData: {
    custom_id: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a select menu is submitted."},
    { id: 'message', label: 'Source Message Object', type: 'object', eventPath: 'message', description: "The message containing the submitted component."},
    { id: 'message_id', label: 'Message ID', type: 'string', eventPath: 'message.id', description: "ID of the message tied to this event."},
    { id: 'custom_id', label: 'Custom ID', type: 'string', eventPath: 'data.custom_id', description: "Custom ID of the submitted component."},
    { id: 'selected_values', label: 'Selected Values', type: 'string', eventPath: 'data.values', description: "Values selected in the menu."},
    { id: 'user_id', label: 'User ID', type: 'string', eventPath: 'member.user.id', description: "ID of the user who triggered or was affected by the event."},
    { id: 'guild_id', label: 'Server ID', type: 'string', eventPath: 'guild_id', description: "ID of the server where the event occurred."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', eventPath: 'channel_id', description: "ID of the channel where the event occurred."},
    { id: 'thread_id', label: 'Thread ID', type: 'string', description: "ID of the thread where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', eventPath: 'application_id', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', eventPath: 'id', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', eventPath: 'token', description: "Token used to respond to the interaction."}
  ]
};
