import { useState, useRef, useEffect } from 'react'
import './index.css'
import { translate, streamAgent, type AgentOptions, type AgentHistoryEntry } from './services/api'

type Lang = 'KO' | 'EN'
type InputMode = 'voice' | 'text'
type SpeakerState = 'idle' | 'translating' | 'error'
type AgentStatus = 'idle' | 'analyzing' | 'searching' | 'done'

interface Message {
  id: number
  speaker: 'bottom' | 'top'
  original: string
  translation: string
  agentResponse: string | null  // null = 아직 에이전트 미처리
}

const LANG_CONFIG: Record<Lang, {
  label: string
  placeholder: string
  micSample: string
  translating: string
  error: string
  retry: string
}> = {
  KO: {
    label: '한국어 (Korean)',
    placeholder: '한국어로 입력하세요...',
    micSample: '공항까지 가는데 택시비가 얼마예요?',
    translating: '번역 중...',
    error: '번역에 실패했습니다.',
    retry: '다시 시도',
  },
  EN: {
    label: 'English (US)',
    placeholder: 'Type in English...',
    micSample: "It's 50 dollars.",
    translating: 'Translating...',
    error: 'Translation failed.',
    retry: 'Retry',
  },
}

const LANG_OPTIONS: { code: Lang; label: string }[] = [
  { code: 'KO', label: '한국어' },
  { code: 'EN', label: 'English' },
]

let _id = 0

function App() {
  const [bottomLang, setBottomLang] = useState<Lang>('KO')
  const topLang: Lang = bottomLang === 'KO' ? 'EN' : 'KO'

  const [messages, setMessages] = useState<Message[]>([])
  const [bottomState, setBottomState] = useState<SpeakerState>('idle')
  const [topState, setTopState] = useState<SpeakerState>('idle')
  const [isBottomListening, setIsBottomListening] = useState(false)
  const [isTopListening, setIsTopListening] = useState(false)
  const [bottomMode, setBottomMode] = useState<InputMode>('voice')
  const [topMode, setTopMode] = useState<InputMode>('voice')
  const [bottomDraft, setBottomDraft] = useState('')
  const [topDraft, setTopDraft] = useState('')
  const [showBottomPicker, setShowBottomPicker] = useState(false)
  const [showTopPicker, setShowTopPicker] = useState(false)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [agentQuery, setAgentQuery] = useState('')
  const [agentResult, setAgentResult] = useState('')
  const [agentVisible, setAgentVisible] = useState(false)
  const [debugMode, setDebugMode] = useState(false)
  const [agentReasoning, setAgentReasoning] = useState('')
  const [userLocation, setUserLocation] = useState<string | null>(null)
  const [locationStatus, setLocationStatus] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle')

  const agentStreamId = useRef(0)
  const agentHasResult = useRef(false)

  useEffect(() => {
    if (!navigator.geolocation) return
    setLocationStatus('loading')
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=14`,
            { headers: { 'User-Agent': 'TranslationApp/1.0' } },
          )
          const data = await res.json() as { address: Record<string, string> }
          const addr = data.address
          const parts = [
            addr.suburb ?? addr.neighbourhood ?? addr.quarter,
            addr.city ?? addr.town ?? addr.municipality,
            addr.country,
          ].filter(Boolean)
          setUserLocation(parts.join(', '))
        } catch {
          setUserLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
        }
        setLocationStatus('ready')
      },
      () => setLocationStatus('denied'),
      { timeout: 10000 },
    )
  }, [])

  const lastBottom = messages.filter(m => m.speaker === 'bottom').at(-1)
  const lastTop = messages.filter(m => m.speaker === 'top').at(-1)
  const latestSpeaker = messages.at(-1)?.speaker

  const clearConversation = () => {
    agentStreamId.current++
    setMessages([])
    setBottomState('idle')
    setTopState('idle')
    setAgentVisible(false)
    setAgentStatus('idle')
    setAgentResult('')
    setAgentQuery('')
    setAgentReasoning('')
  }

  const swapLanguages = () => {
    setBottomLang(prev => prev === 'KO' ? 'EN' : 'KO')
    clearConversation()
  }

  const selectBottomLang = (lang: Lang) => {
    if (lang !== bottomLang) swapLanguages()
    setShowBottomPicker(false)
  }

  const selectTopLang = (lang: Lang) => {
    if (lang !== topLang) swapLanguages()
    setShowTopPicker(false)
  }

  const runAgentStream = (
    history: AgentHistoryEntry[],
    options?: AgentOptions,
    onComplete?: (result: string | null) => void,
  ) => {
    const id = ++agentStreamId.current
    const live = () => agentStreamId.current === id
    agentHasResult.current = false
    let collected = ''

    void streamAgent(history, {
      onAnalyzing: () => { if (live()) setAgentStatus('analyzing') },

      onSearching: (query) => {
        if (live()) { setAgentStatus('searching'); setAgentQuery(query); setAgentVisible(true) }
      },
      onResult: (text) => {
        if (live()) {
          agentHasResult.current = true
          collected += text
          setAgentResult(prev => prev + text)
          setAgentVisible(true)
        }
      },
      onDone: () => {
        if (live()) {
          setAgentStatus('done')
          if (!agentHasResult.current) setAgentVisible(false)
          onComplete?.(collected || null)
        }
      },
      onError: (msg) => {
        if (live()) {
          console.error('Agent error:', msg)
          setAgentStatus('done')
          setAgentVisible(false)
          onComplete?.(null)
        }
      },
      onReasoning: (text) => { if (live()) setAgentReasoning(text) },
    }, options).catch(err => {
      if (live()) {
        console.error('Agent stream error:', err)
        setAgentStatus('done')
        setAgentVisible(false)
        onComplete?.(null)
      }
    })
  }

  const sendMessage = async (speaker: 'bottom' | 'top', text: string) => {
    const setState = speaker === 'bottom' ? setBottomState : setTopState
    const sourceLang = speaker === 'bottom' ? bottomLang : topLang
    const targetLang = speaker === 'bottom' ? topLang : bottomLang

    setState('translating')
    setAgentVisible(false)
    setAgentStatus('idle')
    setAgentResult('')
    setAgentQuery('')
    setAgentReasoning('')

    try {
      const translation = await translate(text, sourceLang, targetLang)
      const msgId = _id++
      const newMsg: Message = { id: msgId, speaker, original: text, translation, agentResponse: null }

      // 클로저의 messages(현재 렌더 기준)에 newMsg를 추가해 히스토리 구성
      const agentHistory: AgentHistoryEntry[] = [...messages, newMsg].map(m => ({
        sourceLang: m.speaker === 'bottom' ? bottomLang : topLang,
        sourceText: m.original,
        targetLang: m.speaker === 'bottom' ? topLang : bottomLang,
        translatedText: m.translation,
        agentResponse: m.agentResponse,
      }))

      setMessages(prev => [...prev, newMsg])
      setState('idle')
      runAgentStream(agentHistory, { debug: debugMode, responseLang: bottomLang, userLocation: userLocation ?? undefined }, (result) => {
        // 에이전트 응답을 해당 메시지에 기록 → 다음 에이전트 호출 시 KV 캐시 활용
        setMessages(prev => prev.map(m =>
          m.id === msgId ? { ...m, agentResponse: result ?? 'SKIP' } : m
        ))
      })
    } catch {
      setState('error')
    }
  }

  const handleBottomMicClick = () => {
    if (bottomState === 'translating' || isBottomListening) return
    setIsBottomListening(true)
    setTimeout(() => {
      setIsBottomListening(false)
      void sendMessage('bottom', LANG_CONFIG[bottomLang].micSample)
    }, 1500)
  }

  const handleBottomTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bottomDraft.trim() || bottomState === 'translating') return
    void sendMessage('bottom', bottomDraft.trim())
    setBottomDraft('')
  }

  const handleTopMicClick = () => {
    if (topState === 'translating' || isTopListening) return
    setIsTopListening(true)
    setTimeout(() => {
      setIsTopListening(false)
      void sendMessage('top', LANG_CONFIG[topLang].micSample)
    }, 1500)
  }

  const handleTopTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topDraft.trim() || topState === 'translating') return
    void sendMessage('top', topDraft.trim())
    setTopDraft('')
  }

  const showAgentOverlay = agentVisible && (
    agentStatus === 'searching' || agentResult !== ''
  )

  const LangSelector = ({
    lang,
    show,
    onToggle,
    onSelect,
  }: {
    lang: Lang
    show: boolean
    onToggle: () => void
    onSelect: (l: Lang) => void
  }) => (
    <div className="lang-selector-wrap">
      <button className="lang-selector" onClick={onToggle}>
        <span>{LANG_CONFIG[lang].label}</span>
        <i className="fa-solid fa-chevron-down"></i>
      </button>
      {show && (
        <>
          <div className="picker-overlay" onClick={() => onSelect(lang)} />
          <div className="lang-dropdown">
            {LANG_OPTIONS.map(opt => (
              <button
                key={opt.code}
                className={`lang-option ${lang === opt.code ? 'active' : ''}`}
                onClick={() => onSelect(opt.code)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )

  const showDebugSidebar = debugMode && (agentStatus !== 'idle' || agentReasoning !== '')

  return (
    <div className="app-wrapper">
    {showDebugSidebar && <div className="debug-spacer" aria-hidden="true" />}
    <div className="app-container">
      {/* Top Pane */}
      <div className="pane top-pane">
        <div className="lang-label">
          <LangSelector
            lang={topLang}
            show={showTopPicker}
            onToggle={() => setShowTopPicker(p => !p)}
            onSelect={selectTopLang}
          />
          <i className="fa-solid fa-expand"></i>
        </div>

        <div className="text-content">
          {lastTop ? (
            <div className="main-text">{lastTop.original}</div>
          ) : lastBottom ? (
            <div className="main-text">{lastBottom.translation}</div>
          ) : (
            <div className="main-text" style={{ opacity: 0.3 }}>...</div>
          )}
          {lastTop && (
            <div className="sub-text">{lastTop.translation}</div>
          )}
          {topState === 'translating' && (
            <div className="translating-indicator">
              <i className="fa-solid fa-circle-notch fa-spin"></i> {LANG_CONFIG[topLang].translating}
            </div>
          )}
          {topState === 'error' && (
            <div className="translation-error">
              <span><i className="fa-solid fa-triangle-exclamation"></i> {LANG_CONFIG[topLang].error}</span>
              <button className="retry-button" onClick={() => setTopState('idle')}>
                {LANG_CONFIG[topLang].retry}
              </button>
            </div>
          )}
        </div>

        <div className="input-controls">
          <button
            className="mode-toggle"
            onClick={() => setTopMode(m => m === 'voice' ? 'text' : 'voice')}
          >
            <i className={`fa-solid fa-${topMode === 'voice' ? 'keyboard' : 'microphone'}`}></i>
          </button>
          {topMode === 'voice' ? (
            <div
              className={`mic-button top-mic ${isTopListening ? 'listening' : ''}`}
              onClick={handleTopMicClick}
            >
              <i className="fa-solid fa-microphone"></i>
            </div>
          ) : (
            <form className="text-input-form" onSubmit={handleTopTextSubmit}>
              <input
                className="text-input top-input"
                type="text"
                placeholder={LANG_CONFIG[topLang].placeholder}
                value={topDraft}
                onChange={e => setTopDraft(e.target.value)}
                disabled={topState === 'translating'}
              />
              <button
                className="send-button top-send"
                type="submit"
                disabled={topState === 'translating' || !topDraft.trim()}
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Language swap divider */}
      <div className="pane-divider">
        {locationStatus === 'ready' && userLocation && (
          <div className="location-badge" title={userLocation}>
            <i className="fa-solid fa-location-dot"></i>
            <span className="location-text">{userLocation}</span>
          </div>
        )}
        {locationStatus === 'loading' && (
          <div className="location-badge location-loading">
            <i className="fa-solid fa-circle-notch fa-spin"></i>
          </div>
        )}
        <button className="swap-button" onClick={swapLanguages} title="언어 교환">
          <i className="fa-solid fa-arrows-up-down"></i>
        </button>
        <button
          className={`debug-toggle ${debugMode ? 'active' : ''}`}
          onClick={() => setDebugMode(d => !d)}
          title={debugMode ? '디버그 모드 끄기' : '디버그 모드 켜기'}
        >
          <i className="fa-solid fa-bug"></i>
        </button>
      </div>

      {/* Bottom Pane */}
      <div className="pane bottom-pane">
        <div className="lang-label">
          <LangSelector
            lang={bottomLang}
            show={showBottomPicker}
            onToggle={() => setShowBottomPicker(p => !p)}
            onSelect={selectBottomLang}
          />
          <i className="fa-solid fa-expand"></i>
        </div>

        <div className="text-content">
          {lastBottom ? (
            <div className="main-text">{lastBottom.original}</div>
          ) : (
            <div className="main-text" style={{ opacity: 0.3 }}>...</div>
          )}
          {lastTop && latestSpeaker === 'top' && (
            <div className="main-text response-text">{lastTop.translation}</div>
          )}
          {lastBottom && latestSpeaker === 'bottom' && (
            <div className="sub-text">{lastBottom.translation}</div>
          )}
          {bottomState === 'translating' && (
            <div className="translating-indicator">
              <i className="fa-solid fa-circle-notch fa-spin"></i> {LANG_CONFIG[bottomLang].translating}
            </div>
          )}
          {bottomState === 'error' && (
            <div className="translation-error">
              <span><i className="fa-solid fa-triangle-exclamation"></i> {LANG_CONFIG[bottomLang].error}</span>
              <button className="retry-button" onClick={() => setBottomState('idle')}>
                {LANG_CONFIG[bottomLang].retry}
              </button>
            </div>
          )}

          {showAgentOverlay && (
            <div className="subtle-agent-note">
              <i className={`fa-solid ${agentResult ? 'fa-circle-info' : 'fa-circle-notch fa-spin'}`}></i>
              <div className="agent-content">
                {!agentResult && agentStatus === 'searching' && (
                  <span className="agent-status-text">검색 중: {agentQuery}</span>
                )}
                {agentResult && (
                  <>
                    <strong>팩트체크</strong><br />
                    {agentResult}
                  </>
                )}
              </div>
              {agentStatus === 'done' && (
                <button className="agent-dismiss" onClick={() => setAgentVisible(false)}>
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="input-controls">
          <button
            className="mode-toggle"
            onClick={() => setBottomMode(m => m === 'voice' ? 'text' : 'voice')}
          >
            <i className={`fa-solid fa-${bottomMode === 'voice' ? 'keyboard' : 'microphone'}`}></i>
          </button>
          {bottomMode === 'voice' ? (
            <div
              className={`mic-button bottom-mic ${isBottomListening ? 'listening' : ''}`}
              onClick={handleBottomMicClick}
            >
              <i className="fa-solid fa-microphone"></i>
            </div>
          ) : (
            <form className="text-input-form" onSubmit={handleBottomTextSubmit}>
              <input
                className="text-input bottom-input"
                type="text"
                placeholder={LANG_CONFIG[bottomLang].placeholder}
                value={bottomDraft}
                onChange={e => setBottomDraft(e.target.value)}
                disabled={bottomState === 'translating'}
              />
              <button
                className="send-button bottom-send"
                type="submit"
                disabled={bottomState === 'translating' || !bottomDraft.trim()}
              >
                <i className="fa-solid fa-paper-plane"></i>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>

    {showDebugSidebar && (
      <div className="debug-sidebar">
        <div className="debug-header">
          <i className="fa-solid fa-bug"></i> 에이전트 추론
        </div>
        {agentStatus === 'analyzing' && !agentReasoning && (
          <div className="debug-thinking">
            <i className="fa-solid fa-circle-notch fa-spin"></i> 추론 중...
          </div>
        )}
        {agentReasoning && (
          <>
            <div className="debug-content">{agentReasoning}</div>
            <div className={`debug-decision ${agentResult ? 'checked' : 'skipped'}`}>
              {agentStatus !== 'done'
                ? '— 분석 중 —'
                : agentResult
                  ? '✓ 팩트체크 수행'
                  : '✗ 팩트체크 불필요'}
            </div>
          </>
        )}
      </div>
    )}
    </div>
  )
}

export default App
