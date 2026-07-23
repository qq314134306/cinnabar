export const PUBLIC_AI_UNAVAILABLE_MESSAGE =
  'AI readings are temporarily unavailable. Please check back soon.'

export function isPublicAiReadingEnabled(
  value: unknown = import.meta.env.VITE_ENABLE_PUBLIC_AI_READINGS,
): boolean {
  return value === 'true'
}
