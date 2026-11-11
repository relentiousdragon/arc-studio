export function createDebouncedFieldWriter(onCommit, delayMs = 100) {
  let timer = null;
  let pendingValue;

  const flush = () => {
    if (timer === null) return false;
    clearTimeout(timer);
    timer = null;
    const value = pendingValue;
    pendingValue = undefined;
    onCommit(value);
    return true;
  };

  return {
    schedule(value) {
      pendingValue = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel() {
      if (timer === null) return false;
      clearTimeout(timer);
      timer = null;
      pendingValue = undefined;
      return true;
    }
  };
}
