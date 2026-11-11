export default {
  description: 'Fires when a message component button is pressed',
  type: 'event_button_click',
  category: 'Events',
  label: 'On Button Click',
  color: '#5865F2',
  gatewayEvent: 'INTERACTION_CREATE',
  gatewayInteractionType: 3,
  gatewayComponentTypes: [
    2
  ],
  defaultData: {
    custom_id: ''
  },
  inputs: [],
  outputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: "Runs when a message component button is pressed."},
    { id: 'message', label: 'Source Message Object', type: 'object', eventPath: 'message', description: "The message containing the submitted component."},
    { id: 'message_id', label: 'Message ID', type: 'string', eventPath: 'message.id', description: "ID of the message tied to this event."},
    { id: 'custom_id', label: 'Custom ID', type: 'string', description: "Custom ID of the submitted component."},
    { id: 'user_id', label: 'User ID', type: 'string', description: "ID of the user who triggered or was affected by the event."},
    { id: 'guild_id', label: 'Server ID', type: 'string', eventPath: 'guild_id', description: "ID of the server where the event occurred."},
    { id: 'channel_id', label: 'Channel ID', type: 'string', eventPath: 'channel_id', description: "ID of the channel where the event occurred."},
    { id: 'thread_id', label: 'Thread ID', type: 'string', description: "ID of the thread where the event occurred."},
    { id: 'application_id', label: 'Application ID', type: 'string', description: "ID of the application that received the interaction."},
    { id: 'interaction_id', label: 'Interaction ID', type: 'string', description: "ID of the interaction."},
    { id: 'interaction_token', label: 'Interaction Token', type: 'string', description: "Token used to respond to the interaction."}
  ]
};
