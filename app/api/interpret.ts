/**
 * [INPUT]: Depends on a POST body { messages: ChatMessage[] } from src/lib/llm.ts
 * [OUTPUT]: Streams a DeepSeek chat completion back to the browser as Server-Sent Events
 * [POS]: Vercel Edge Function — the only place DEEPSEEK_API_KEY is read, keeping it off the client
 * [PROTOCOL]: Update this header when changed, then check AGENTS.md/CLAUDE.md
 */

export const config = { runtime: 'edge' }

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
const MAX_BODY_LENGTH = 60_000

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonError('Method Not Allowed', 405)
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return jsonError('DEEPSEEK_API_KEY is not configured on the server.', 500)
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_LENGTH) {
    return jsonError('Request body too large.', 413)
  }

  let messages: unknown
  try {
    messages = JSON.parse(rawBody)?.messages
  } catch {
    return jsonError('Invalid JSON body.', 400)
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonError('messages must be a non-empty array.', 400)
  }

  const upstream = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: 'deepseek-chat', messages, stream: true }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    return jsonError(`DeepSeek API error: ${upstream.status} ${detail}`, upstream.status || 502)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
