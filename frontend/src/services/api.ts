const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const MOCK_KEY = import.meta.env.VITE_UPSTAGE_API_KEY ?? ''

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
}

// 대화 히스토리 한 턴. agentResponse가 null이면 아직 에이전트가 처리하지 않은 항목.
export interface AgentHistoryEntry {
  sourceLang: 'KO' | 'EN'
  sourceText: string
  targetLang: 'KO' | 'EN'
  translatedText: string
  agentResponse: string | null
}

// ── Mock: Upstage API를 직접 호출해 백엔드 없이 동작 ────────────────────────

const UPSTAGE_URL = 'https://api.upstage.ai/v1/chat/completions'
const MOCK_MODEL = 'solar-pro2'
const LANG_NAME: Record<'KO' | 'EN', string> = { KO: 'Korean', EN: 'English' }

const upstageHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${MOCK_KEY}`,
}

function stripRoleTokens(text: string): string {
  return text.replace(/\s*(assistant|user|system)\s*$/gi, '').trim()
}

async function mockTranslate(
  text: string,
  sourceLang: 'KO' | 'EN',
  targetLang: 'KO' | 'EN',
): Promise<string> {
  const res = await fetch(UPSTAGE_URL, {
    method: 'POST',
    headers: upstageHeaders,
    body: JSON.stringify({
      model: MOCK_MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Output only the translated text with no labels, role names, or explanations.',
        },
        {
          role: 'user',
          content: `Translate from ${LANG_NAME[sourceLang]} to ${LANG_NAME[targetLang]}:\n${text}`,
        },
      ],
    }),
  })
  if (!res.ok) throw new Error(`Translation failed: ${res.status}`)
  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  return stripRoleTokens(data.choices[0].message.content)
}

// 멀티턴 메시지 구조로 빌드:
// - 시스템 메시지는 항상 동일 → KV 캐시 히트
// - 이전 턴(user+assistant)은 변경되지 않음 → KV 캐시 히트
// - 마지막 user 메시지만 새로 추가
function buildAgentMessages(
  history: AgentHistoryEntry[],
  responseLang: 'KO' | 'EN',
  debug: boolean,
): Array<{ role: string; content: string }> {
  const systemContent = debug
    ? `You are a fact-checking assistant for a real-time translation app.
You have the full conversation history for context. Focus on the LATEST exchange, using prior context to understand it.
Check for verifiable factual claims (prices, distances, regulations, business hours, etc.).

Respond in this EXACT format (no extra text):
REASONING: [팩트체크 여부를 결정한 근거를 1-2문장으로 한국어로 설명]
RESULT: [Either "SKIP" if nothing to fact-check, or a concise 1-2 sentence fact-check note in ${LANG_NAME[responseLang]}]`
    : `You are a fact-checking assistant for a real-time translation app.
You have the full conversation history for context. Focus on the LATEST exchange, using prior context to understand it.
Check for verifiable factual claims (prices, distances, regulations, business hours, etc.).
- If the LATEST exchange contains a claim worth fact-checking: respond with a concise 1-2 sentence note in ${LANG_NAME[responseLang]}.
- Otherwise: respond with exactly "SKIP" and nothing else.`

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemContent },
  ]

  for (let i = 0; i < history.length; i++) {
    const entry = history[i]
    const isLast = i === history.length - 1

    messages.push({
      role: 'user',
      content: `[${LANG_NAME[entry.sourceLang]}] ${entry.sourceText}\n[${LANG_NAME[entry.targetLang]}] ${entry.translatedText}`,
    })

    // 이전 턴: 에이전트가 이미 응답했으면 assistant 턴으로 추가 (KV 캐시 유지)
    if (!isLast && entry.agentResponse !== null) {
      messages.push({ role: 'assistant', content: entry.agentResponse || 'SKIP' })
    }
  }

  return messages
}

function parseDebugResponse(raw: string): { reasoning: string; result: string } {
  const reasoningMatch = raw.match(/REASONING:\s*([\s\S]*?)(?=\nRESULT:)/i)
  const resultMatch = raw.match(/RESULT:\s*([\s\S]*)$/i)
  return {
    reasoning: stripRoleTokens(reasoningMatch?.[1]?.trim() ?? ''),
    result: stripRoleTokens(resultMatch?.[1]?.trim() ?? raw),
  }
}

async function mockStreamAgent(
  history: AgentHistoryEntry[],
  callbacks: AgentCallbacks,
  options?: AgentOptions,
): Promise<void> {
  callbacks.onAnalyzing()
  const debug = options?.debug ?? false
  const latest = history[history.length - 1]
  const responseLang = options?.responseLang ?? latest.sourceLang

  const res = await fetch(UPSTAGE_URL, {
    method: 'POST',
    headers: upstageHeaders,
    body: JSON.stringify({
      model: MOCK_MODEL,
      max_tokens: debug ? 512 : 256,
      messages: buildAgentMessages(history, responseLang, debug),
    }),
  })

  if (!res.ok) {
    callbacks.onError(`Agent failed: ${res.status}`)
    return
  }

  const data = await res.json() as { choices: Array<{ message: { content: string } }> }
  const raw = stripRoleTokens(data.choices[0].message.content)

  if (debug) {
    const { reasoning, result } = parseDebugResponse(raw)
    if (reasoning) callbacks.onReasoning?.(reasoning)
    if (!result || result.toUpperCase().startsWith('SKIP')) {
      callbacks.onDone()
      return
    }
    callbacks.onSearching('fact-checking')
    callbacks.onResult(result)
  } else {
    if (!raw || raw.toUpperCase().startsWith('SKIP')) {
      callbacks.onDone()
      return
    }
    callbacks.onSearching('fact-checking')
    callbacks.onResult(raw)
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
  history: AgentHistoryEntry[],
  callbacks: AgentCallbacks,
  options?: AgentOptions,
): Promise<void> {
  if (USE_MOCK) return mockStreamAgent(history, callbacks, options)

  // 실제 백엔드: 최신 턴만 전달 (추후 히스토리 지원 시 확장)
  const latest = history[history.length - 1]
  const res = await fetch(`${BASE_URL}/api/agent/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_lang: latest.sourceLang,
      source_text: latest.sourceText,
      target_lang: latest.targetLang,
      translated_text: latest.translatedText,
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
