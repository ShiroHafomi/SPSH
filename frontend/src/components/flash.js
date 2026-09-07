export function normalizeFlashInput(input, fallbackType = 'success') {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return {
      message: input.message == null ? '' : String(input.message),
      type: typeof input.type === 'string' && input.type ? input.type : fallbackType,
    };
  }

  return {
    message: input == null ? '' : String(input),
    type: fallbackType,
  };
}
