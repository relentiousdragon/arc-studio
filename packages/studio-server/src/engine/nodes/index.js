// Events
import node_event_message_create from './event_message_create.js';
import node_event_slash_command from './event_slash_command.js';
import node_event_slash_autocomplete from './event_slash_autocomplete.js';
import node_event_button_click from './event_button_click.js';
import node_event_member_join from './event_member_join.js';
import node_event_message_update from './event_message_update.js';
import node_event_message_delete from './event_message_delete.js';
import node_event_reaction_add from './event_reaction_add.js';
import node_event_reaction_remove from './event_reaction_remove.js';
import node_event_channel_create from './event_channel_create.js';
import node_event_channel_update from './event_channel_update.js';
import node_event_channel_delete from './event_channel_delete.js';
import node_event_guild_create from './event_guild_create.js';
import node_event_guild_update from './event_guild_update.js';
import node_event_guild_delete from './event_guild_delete.js';
import node_event_role_create from './event_role_create.js';
import node_event_role_update from './event_role_update.js';
import node_event_role_delete from './event_role_delete.js';
import node_event_thread_create from './event_thread_create.js';
import node_event_thread_update from './event_thread_update.js';
import node_event_thread_delete from './event_thread_delete.js';
import node_event_typing_start from './event_typing_start.js';
import node_event_channel_pins_update from './event_channel_pins_update.js';
import node_event_message_reaction_remove_all from './event_message_reaction_remove_all.js';
import node_event_select_menu from './event_select_menu.js';
import node_event_modal_submit from './event_modal_submit.js';
import node_event_member_remove from './event_member_remove.js';
import node_event_voice_state_update from './event_voice_state_update.js';
import node_event_presence_update from './event_presence_update.js';
import node_event_guild_ban_add from './event_guild_ban_add.js';
import node_event_guild_ban_remove from './event_guild_ban_remove.js';
import node_event_scheduled_event_create from './event_scheduled_event_create.js';
import node_event_scheduled_event_update from './event_scheduled_event_update.js';
import node_event_scheduled_event_delete from './event_scheduled_event_delete.js';
import node_event_automod_action from './event_automod_action.js';
import node_event_invite_create from './event_invite_create.js';
import node_event_invite_delete from './event_invite_delete.js';
import node_event_bot_ready from './event_bot_ready.js';
import node_event_bot_startup from './event_bot_startup.js';
import node_event_cron from './event_cron.js';
import node_event_websocket_open from './event_websocket_open.js';
import node_event_websocket_message from './event_websocket_message.js';
import node_event_websocket_close from './event_websocket_close.js';
import node_event_websocket_error from './event_websocket_error.js';
// Logic & Flow
import node_logic_and from './logic_and.js';
import node_logic_or from './logic_or.js';
import node_logic_xor from './logic_xor.js';
import node_logic_xor_many from './logic_xor_many.js';
import node_logic_not from './logic_not.js';
// Variables
import node_variable_get from './variable_get.js';
import node_variable_create from './variable_create.js';
import node_variable_set from './variable_set.js';
// Functions
import node_function_input from './function_input.js';
import node_function_return from './function_return.js';
import node_function_call from './function_call.js';
// Logic & Flow
import node_execute_graph from './execute_graph.js';
// Functions
import node_function_math from './function_math.js';
// Math
import node_math_add from './math_add.js';
import node_math_subtract from './math_subtract.js';
import node_math_multiply from './math_multiply.js';
import node_math_divide from './math_divide.js';
import node_math_modulo from './math_modulo.js';
import node_math_power from './math_power.js';
import node_math_min from './math_min.js';
import node_math_max from './math_max.js';
import node_math_abs from './math_abs.js';
import node_math_sqrt from './math_sqrt.js';
import node_math_round from './math_round.js';
import node_math_floor from './math_floor.js';
import node_math_ceil from './math_ceil.js';
import node_math_sin from './math_sin.js';
import node_math_cos from './math_cos.js';
import node_math_tan from './math_tan.js';
import node_math_asin from './math_asin.js';
import node_math_acos from './math_acos.js';
import node_math_atan from './math_atan.js';
import node_math_log from './math_log.js';
import node_math_log10 from './math_log10.js';
import node_math_exp from './math_exp.js';
import node_math_sign from './math_sign.js';
import node_math_clamp from './math_clamp.js';
import node_math_sum from './math_sum.js';
import node_math_average from './math_average.js';
import node_math_lerp from './math_lerp.js';
import node_math_constant from './math_constant.js';
import node_math_compare from './math_compare.js';
import node_math_random from './math_random.js';
// Logic & Flow
import node_branch_if from './branch_if.js';
import node_branch_switch from './branch_switch.js';
import node_compare_text from './compare_text.js';
import node_delay from './delay.js';
import node_loop_count from './loop_count.js';
import node_repeat_while from './repeat_while.js';
import node_wait_until_condition from './wait_until_condition.js';
import node_wait_until_time from './wait_until_time.js';
import node_parallel from './parallel.js';
import node_parallel_join from './parallel_join.js';
import node_utility_wire_extender from './utility_wire_extender.js';
// Discord Actions
import node_action_send_message from './action_send_message.js';
import node_action_edit_message from './action_edit_message.js';
import node_action_edit_components from './action_edit_components.js';
import node_action_reply_interaction from './action_reply_interaction.js';
import node_action_respond_autocomplete from './action_respond_autocomplete.js';
import node_action_show_modal from './action_show_modal.js';
import node_action_deploy_slash_commands from './action_deploy_slash_commands.js';
import node_action_defer_reply from './action_defer_reply.js';
import node_action_defer_update from './action_defer_update.js';
import node_action_edit_interaction_reply from './action_edit_interaction_reply.js';
import node_action_set_custom_status from './action_set_custom_status.js';
import node_action_fetch_user from './action_fetch_user.js';
import node_action_fetch_guild from './action_fetch_guild.js';
import node_action_fetch_member from './action_fetch_member.js';
import node_action_fetch_channel from './action_fetch_channel.js';
import node_action_fetch_channel_messages from './action_fetch_channel_messages.js';
import node_action_fetch_message from './action_fetch_message.js';
import node_action_set_presence from './action_set_presence.js';
import node_action_create_channel from './action_create_channel.js';
import node_action_create_thread from './action_create_thread.js';
import node_action_start_thread_from_message from './action_start_thread_from_message.js';
import node_action_edit_channel from './action_edit_channel.js';
import node_action_delete_channel from './action_delete_channel.js';
import node_action_create_role from './action_create_role.js';
import node_action_member_role from './action_member_role.js';
import node_action_moderate_member from './action_moderate_member.js';
import node_action_voice_channel_status from './action_voice_channel_status.js';
import node_action_voice_state from './action_voice_state.js';
// Values & Data
import node_value_text from './value_text.js';
import node_value_number from './value_number.js';
import node_value_boolean from './value_boolean.js';
import node_data_to_json from './data_to_json.js';
import node_data_parse_json from './data_parse_json.js';
import node_data_to_number from './data_to_number.js';
import node_data_check_value from './data_check_value.js';
import node_data_get_value_by_path from './data_get_value_by_path.js';
import node_data_find_array_item from './data_find_array_item.js';
import node_data_filter_array from './data_filter_array.js';
import node_data_format_number from './data_format_number.js';
import node_data_to_text from './data_to_text.js';
import node_data_to_boolean from './data_to_boolean.js';
import node_data_regex from './data_regex.js';
import node_data_array_create from './data_array_create.js';
import node_data_array_concat from './data_array_concat.js';
import node_data_array_length from './data_array_length.js';
import node_data_array_get from './data_array_get.js';
import node_data_array_set from './data_array_set.js';
import node_data_array_append from './data_array_append.js';
import node_data_object_get from './data_object_get.js';
import node_data_object_set from './data_object_set.js';
import node_data_object_keys from './data_object_keys.js';
import node_data_string_split from './data_string_split.js';
import node_data_parse_prefix_command from './data_parse_prefix_command.js';
import node_data_string_join from './data_string_join.js';
import node_data_text_replace from './data_text_replace.js';
import node_data_text_uppercase from './data_text_uppercase.js';
import node_data_text_lowercase from './data_text_lowercase.js';
import node_data_text_titlecase from './data_text_titlecase.js';
import node_data_text_trim from './data_text_trim.js';
import node_data_format_time from './data_format_time.js';
import node_data_to_iso_time from './data_to_iso_time.js';
import node_data_permission_overwrites from './data_permission_overwrites.js';
import node_format_text from './format_text.js';
import node_build_embed from './build_embed.js';
import node_build_components from './build_components.js';
import node_build_modal from './build_modal.js';
import node_data_get_modal_value from './data_get_modal_value.js';
import node_modify_embed from './modify_embed.js';
import node_modify_components from './modify_components.js';
// Cryptography & Security
import node_action_crypto_hash from './action_crypto_hash.js';
import node_action_crypto_hmac from './action_crypto_hmac.js';
import node_action_crypto_verify_hmac from './action_crypto_verify_hmac.js';
import node_action_crypto_encrypt from './action_crypto_encrypt.js';
import node_action_crypto_decrypt from './action_crypto_decrypt.js';
import node_action_crypto_random from './action_crypto_random.js';
// Web & Network
import node_action_web_fetch from './action_web_fetch.js';
import node_action_http_download from './action_http_download.js';
import node_action_web_retry from './action_web_retry.js';
import node_action_websocket_connect from './action_websocket_connect.js';
import node_action_websocket_send from './action_websocket_send.js';
import node_action_websocket_close from './action_websocket_close.js';
//
export const nodeDefinitions = [
  node_event_message_create,
  node_event_slash_command,
  node_event_slash_autocomplete,
  node_event_button_click,
  node_event_member_join,
  node_event_message_update,
  node_event_message_delete,
  node_event_reaction_add,
  node_event_reaction_remove,
  node_event_channel_create,
  node_event_channel_update,
  node_event_channel_delete,
  node_event_guild_create,
  node_event_guild_update,
  node_event_guild_delete,
  node_event_role_create,
  node_event_role_update,
  node_event_role_delete,
  node_event_thread_create,
  node_event_thread_update,
  node_event_thread_delete,
  node_event_typing_start,
  node_event_channel_pins_update,
  node_event_message_reaction_remove_all,
  node_event_select_menu,
  node_event_modal_submit,
  node_event_member_remove,
  node_event_voice_state_update,
  node_event_presence_update,
  node_event_guild_ban_add,
  node_event_guild_ban_remove,
  node_event_scheduled_event_create,
  node_event_scheduled_event_update,
  node_event_scheduled_event_delete,
  node_event_automod_action,
  node_event_invite_create,
  node_event_invite_delete,
  node_event_bot_ready,
  node_event_bot_startup,
  node_event_websocket_open,
  node_event_websocket_message,
  node_event_websocket_close,
  node_event_websocket_error,
  node_event_cron,
  node_logic_and,
  node_logic_or,
  node_logic_xor,
  node_logic_xor_many,
  node_logic_not,
  node_variable_get,
  node_variable_create,
  node_variable_set,
  node_function_input,
  node_function_return,
  node_function_call,
  node_execute_graph,
  node_function_math,
  node_math_add,
  node_math_subtract,
  node_math_multiply,
  node_math_divide,
  node_math_modulo,
  node_math_power,
  node_math_min,
  node_math_max,
  node_math_abs,
  node_math_sqrt,
  node_math_round,
  node_math_floor,
  node_math_ceil,
  node_math_sin,
  node_math_cos,
  node_math_tan,
  node_math_asin,
  node_math_acos,
  node_math_atan,
  node_math_log,
  node_math_log10,
  node_math_exp,
  node_math_sign,
  node_math_clamp,
  node_math_sum,
  node_math_average,
  node_math_lerp,
  node_math_constant,
  node_math_compare,
  node_math_random,
  node_branch_if,
  node_branch_switch,
  node_compare_text,
  node_delay,
  node_loop_count,
  node_repeat_while,
  node_wait_until_condition,
  node_wait_until_time,
  node_parallel,
  node_parallel_join,
  node_utility_wire_extender,
  node_action_send_message,
  node_action_edit_message,
  node_action_edit_components,
  node_action_reply_interaction,
  node_action_respond_autocomplete,
  node_action_show_modal,
  node_action_deploy_slash_commands,
  node_action_defer_reply,
  node_action_defer_update,
  node_action_edit_interaction_reply,
  node_action_set_custom_status,
  node_action_fetch_user,
  node_action_fetch_guild,
  node_action_fetch_member,
  node_action_fetch_channel,
  node_action_fetch_channel_messages,
  node_action_fetch_message,
  node_action_set_presence,
  node_action_create_channel,
  node_action_create_thread,
  node_action_start_thread_from_message,
  node_action_edit_channel,
  node_action_delete_channel,
  node_action_create_role,
  node_action_member_role,
  node_action_moderate_member,
  node_action_voice_channel_status,
  node_action_voice_state,
  node_value_text,
  node_value_number,
  node_value_boolean,
  node_data_to_json,
  node_data_parse_json,
  node_data_to_number,
  node_data_check_value,
  node_data_get_value_by_path,
  node_data_find_array_item,
  node_data_filter_array,
  node_data_format_number,
  node_data_to_text,
  node_data_to_boolean,
  node_data_regex,
  node_data_array_create,
  node_data_array_concat,
  node_data_array_length,
  node_data_array_get,
  node_data_array_set,
  node_data_array_append,
  node_data_object_get,
  node_data_object_set,
  node_data_object_keys,
  node_data_string_split,
  node_data_parse_prefix_command,
  node_data_string_join,
  node_data_text_replace,
  node_data_text_uppercase,
  node_data_text_lowercase,
  node_data_text_titlecase,
  node_data_text_trim,
  node_data_format_time,
  node_data_to_iso_time,
  node_data_permission_overwrites,
  node_format_text,
  node_build_embed,
  node_build_components,
  node_build_modal,
  node_data_get_modal_value,
  node_modify_embed,
  node_modify_components,
  node_action_crypto_hash,
  node_action_crypto_hmac,
  node_action_crypto_verify_hmac,
  node_action_crypto_encrypt,
  node_action_crypto_decrypt,
  node_action_crypto_random,
  node_action_web_fetch,
  node_action_http_download,
  node_action_web_retry,
  node_action_websocket_connect,
  node_action_websocket_send,
  node_action_websocket_close
];
