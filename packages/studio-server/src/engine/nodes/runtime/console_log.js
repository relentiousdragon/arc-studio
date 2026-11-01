const CONSOLE_LOG_LEVELS = new Map([
  ['action_console_log', 'INFO'],
  ['action_console_warn', 'WARN'],
  ['action_console_error', 'ERROR']
]);
//
export function executeConsoleLogNode(node, { resolveInput, log }) {
  const level = CONSOLE_LOG_LEVELS.get(node?.type);
  if (!level) return false;
  const message = resolveInput('message', node.data?.message ?? '');
  log(message == null ? '' : String(message), level);
  return true;
}