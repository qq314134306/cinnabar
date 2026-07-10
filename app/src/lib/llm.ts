/* ============================================================
   AI reading client — streams from the /api/interpret Vercel proxy.
   The proxy is the only place DEEPSEEK_API_KEY is read; the browser
   never sees it.
   ============================================================ */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const INTERPRET_ENDPOINT = '/api/interpret'

/** Streams a chat completion token-by-token from the server-side DeepSeek proxy. */
export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const response = await fetch(INTERPRET_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || `Reading request failed: ${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const content = json.choices?.[0]?.delta?.content
        if (content) yield content
      } catch {
        // Ignore partial/malformed SSE chunks.
      }
    }
  }
}

/** Convenience wrapper that collects the full streamed text. */
export async function chat(messages: ChatMessage[]): Promise<string> {
  let fullText = ''
  for await (const token of streamChat(messages)) {
    fullText += token
  }
  return fullText
}
