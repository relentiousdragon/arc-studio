export default {
  description: 'Ends this function execution path and returns success or an error message',
  type: 'function_return_exec',
  category: 'Functions',
  label: 'RETURN',
  color: '#a78bfa',
  defaultData: { 'func.success': true, 'func.error': '' },
  inputs: [
    { id: 'exec', label: 'Exec', type: 'exec', description: 'Ends this execution path.' },
    { id: 'func.success', label: 'func.success', type: 'boolean', defaultValue: true, description: 'Whether this function path completed successfully.' },
    { id: 'func.error', label: 'func.error', type: 'string', defaultValue: '', description: 'Error message returned when this function path fails.' }
  ],
  outputs: []
};
