/**
 * [INPUT]: Exact same-origin POST reading.v1 birth requests
 * [OUTPUT]: A server-built DeepSeek SSE reading, or a stable no-store error
 * [POS]: Public AI trust boundary; browsers never provide messages, prompts, or facts
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

import { handlePublicReading } from './_public-reading'

export const config = { runtime: 'nodejs' }

export default async function handler(req: Request): Promise<Response> {
  return handlePublicReading(req)
}
