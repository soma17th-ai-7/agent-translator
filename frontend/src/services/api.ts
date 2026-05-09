const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export interface AgentCallbacks {
  onAnalyzing: () => void
  onSearching: (query: string) => void
  onResult: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
  onReasoning?: (text: string) => void
}

export interface AgentOptions {
  debug?: boolean
  responseLang?: 'KO' | 'EN'
  userLocation?: string
}

export interface AgentHistoryEntry {
  sourceLang: 'KO' | 'EN'
  sourceText: string
  targetLang: 'KO' | 'EN'
  translatedText: string
  agentResponse: string | null
}

export async function translate(
  text: string,
  sourceLang: 'KO' | 'EN',
  targetLang: 'KO' | 'EN',
): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `Translation failed: ${res.status}`)
  }

  const data = await res.json() as { translated_text: string }
  return data.translated_text
}

export async function streamAgent(
  history: AgentHistoryEntry[],
  callbacks: AgentCallbacks,
  options?: AgentOptions,
): Promise<void> {
  const latest = history[history.length - 1]

  const res = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      history: history.map(e => ({
        source_lang: e.sourceLang,
        source_text: e.sourceText,
        target_lang: e.targetLang,
        translated_text: e.translatedText,
        agent_response: e.agentResponse,
      })),
      response_lang: options?.responseLang ?? latest?.sourceLang ?? 'KO',
      debug: options?.debug ?? false,
      user_location: options?.userLocation ?? null,
    }),
  })

  if (!res.ok || !res.body) {
    callbacks.onError(`Agent request failed: ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      if (!block.trim()) continue

      let eventType = ''
      let data: Record<string, unknown> = {}

      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          try { data = JSON.parse(line.slice(6)) as Record<string, unknown> } catch { /* ignore */ }
        }
      }

      switch (eventType) {
        case 'status':
          if (data.state === 'analyzing') callbacks.onAnalyzing()
          else if (data.state === 'searching') callbacks.onSearching((data.query as string) ?? '')
          break
        case 'result':
          callbacks.onResult((data.text as string) ?? '')
          break
        case 'reasoning':
          callbacks.onReasoning?.((data.text as string) ?? '')
          break
        case 'done':
          callbacks.onDone()
          break
        case 'error':
          callbacks.onError((data.message as string) ?? 'Unknown error')
          break
      }
    }
  }
}
