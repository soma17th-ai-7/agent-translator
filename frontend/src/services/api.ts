const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const MOCK_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? ''

export interface AgentCallbacks {
  onAnalyzing: () => void
  onSearching: (query: string) => void
  onResult: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
}

// ── Mock: Anthropic API를 직접 호출해 백엔드 없이 동작 ──────────────────────

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MOCK_MODEL = 'claude-haiku-4-5-20251001'
const LANG_NAME: Record<'KO' | 'EN', string> = { KO: 'Korean', EN: 'English' }

const anthropicHeaders = {
  'Content-Type': 'application/json',
  'x-api-key': MOCK_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-dangerous-allow-browser': 'true',
}

async function mockTranslate(
  text: string,
  sourceLang: 'KO' | 'EN',
  targetLang: 'KO' | 'EN',
): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: anthropicHeaders,
    body: JSON.stringify({
      model: MOCK_MODEL,
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Translate the following ${LANG_NAME[sourceLang]} text to ${LANG_NAME[targetLang]}. Output only the translation with no explanation:\n\n${text}`,
      }],
    }),
  })
  if (!res.ok) throw new Error(`Translation failed: ${res.status}`)
  const data = await res.json() as { content: Array<{ text: string }> }
  return data.content[0].text.trim()
}

async function mockStreamAgent(
  sourceLang: 'KO' | 'EN',
  sourceText: string,
  targetLang: 'KO' | 'EN',
  translatedText: string,
  callbacks: AgentCallbacks,
): Promise<void> {
  callbacks.onAnalyzing()

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: anthropicHeaders,
    body: JSON.stringify({
      model: MOCK_MODEL,
      max_tokens: 256,
      stream: true,
      system: `You are a fact-checking assistant for a real-time translation app.
Analyze the conversation for verifiable factual claims (prices, distances, regulations, business hours, etc.).
- If there IS a claim worth fact-checking: respond with a concise 1-2 sentence fact-check note in ${LANG_NAME[sourceLang]}.
- If there is NOTHING to fact-check (greetings, opinions, casual statements): respond with exactly "SKIP" and nothing else.`,
      messages: [{
        role: 'user',
        content: `[${LANG_NAME[sourceLang]}] ${sourceText}\n[${LANG_NAME[targetLang]}] ${translatedText}`,
      }],
    }),
  })

  if (!res.ok || !res.body) {
    callbacks.onError(`Agent failed: ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
  let streaming = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''

    for (const block of blocks) {
      for (const line of block.split('\n')) {
        if (!line.startsWith('data: ')) continue
        let event: Record<string, unknown>
        try { event = JSON.parse(line.slice(6)) as Record<string, unknown> } catch { continue }

        if (event.type !== 'content_block_delta') continue
        const delta = event.delta as Record<string, unknown>
        if (delta?.type !== 'text_delta') continue
        const chunk = (delta.text as string) ?? ''
        accumulated += chunk

        if (!streaming) {
          // 충분한 텍스트가 모이면 SKIP 여부 판단
          if (accumulated.trimStart().length < 4) continue
          if (accumulated.trimStart().toUpperCase().startsWith('SKIP')) {
            callbacks.onDone()
            return
          }
          streaming = true
          callbacks.onSearching('fact-checking')
          callbacks.onResult(accumulated)
        } else {
          callbacks.onResult(chunk)
        }
      }
    }
  }

  callbacks.onDone()
}

// ── 실제 백엔드 구현 ──────────────────────────────────────────────────────────

export async function translate(
  text: string,
  sourceLang: 'KO' | 'EN',
  targetLang: 'KO' | 'EN',
): Promise<string> {
  if (USE_MOCK) return mockTranslate(text, sourceLang, targetLang)

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
  sourceLang: 'KO' | 'EN',
  sourceText: string,
  targetLang: 'KO' | 'EN',
  translatedText: string,
  callbacks: AgentCallbacks,
): Promise<void> {
  if (USE_MOCK) return mockStreamAgent(sourceLang, sourceText, targetLang, translatedText, callbacks)

  const res = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_lang: sourceLang,
      source_text: sourceText,
      target_lang: targetLang,
      translated_text: translatedText,
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
