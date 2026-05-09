import { useState, useRef } from 'react'
import './index.css'
import { translate, streamAgent } from './services/api'

type InputMode = 'voice' | 'text'
type SpeakerState = 'idle' | 'translating' | 'error'
type AgentStatus = 'idle' | 'analyzing' | 'searching' | 'done'

interface Message {
  id: number
  speaker: 'bottom' | 'top'
  original: string
  translation: string
}

let _id = 0

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [bottomState, setBottomState] = useState<SpeakerState>('idle')
  const [topState, setTopState] = useState<SpeakerState>('idle')
  const [isBottomListening, setIsBottomListening] = useState(false)
  const [isTopListening, setIsTopListening] = useState(false)
  const [bottomMode, setBottomMode] = useState<InputMode>('voice')
  const [topMode, setTopMode] = useState<InputMode>('voice')
  const [bottomDraft, setBottomDraft] = useState('')
  const [topDraft, setTopDraft] = useState('')
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [agentQuery, setAgentQuery] = useState('')
  const [agentResult, setAgentResult] = useState('')
  const [agentVisible, setAgentVisible] = useState(false)

  const agentStreamId = useRef(0)
  const agentHasResult = useRef(false)

  // 가장 최근 메시지를 기준으로 각 화자의 마지막 발화를 가져옴
  const lastBottom = messages.filter(m => m.speaker === 'bottom').at(-1)
  const lastTop = messages.filter(m => m.speaker === 'top').at(-1)
  const latestSpeaker = messages.at(-1)?.speaker

  const runAgentStream = (
    sourceLang: 'KO' | 'EN',
    sourceText: string,
    targetLang: 'KO' | 'EN',
    translatedText: string,
  ) => {
    const id = ++agentStreamId.current
    const live = () => agentStreamId.current === id
    agentHasResult.current = false

    void streamAgent(sourceLang, sourceText, targetLang, translatedText, {
      onAnalyzing: () => { if (live()) setAgentStatus('analyzing') },
      onSearching: (query) => {
        if (live()) { setAgentStatus('searching'); setAgentQuery(query); setAgentVisible(true) }
      },
      onResult: (text) => {
        if (live()) {
          agentHasResult.current = true
          setAgentResult(prev => prev + text)
          setAgentVisible(true)
        }
      },
      onDone: () => {
        if (live()) {
          setAgentStatus('done')
          if (!agentHasResult.current) setAgentVisible(false)
        }
      },
      onError: (msg) => {
        if (live()) { console.error('Agent error:', msg); setAgentStatus('done'); setAgentVisible(false) }
      },
    })
  }

  const sendMessage = async (speaker: 'bottom' | 'top', text: string) => {
    const setState = speaker === 'bottom' ? setBottomState : setTopState
    const sourceLang: 'KO' | 'EN' = speaker === 'bottom' ? 'KO' : 'EN'
    const targetLang: 'KO' | 'EN' = speaker === 'bottom' ? 'EN' : 'KO'

    setState('translating')
    setAgentVisible(false)
    setAgentStatus('idle')
    setAgentResult('')
    setAgentQuery('')

    try {
      const translation = await translate(text, sourceLang, targetLang)
      setMessages(prev => [...prev, { id: _id++, speaker, original: text, translation }])
      setState('idle')
      runAgentStream(sourceLang, text, targetLang, translation)
    } catch {
      setState('error')
    }
  }

  const handleBottomMicClick = () => {
    if (bottomState === 'translating' || isBottomListening) return
    setIsBottomListening(true)
    setTimeout(() => {
      setIsBottomListening(false)
      void sendMessage('bottom', '공항까지 가는데 택시비가 얼마예요?')
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
      void sendMessage('top', "It's 50 dollars.")
    }, 1500)
  }

  const handleTopTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topDraft.trim() || topState === 'translating') return
    void sendMessage('top', topDraft.trim())
    setTopDraft('')
  }

  const showAgentOverlay = agentVisible && (
    agentStatus === 'searching' ||
    agentResult !== ''
  )

  return (
    <div className="app-container">
      {/* Top Pane (English) */}
      <div className="pane top-pane">
        <div className="lang-label">
          <span>English (US)</span>
          <i className="fa-solid fa-expand"></i>
        </div>

        <div className="text-content">
          {/* 영어 화자가 발화했으면 본인 발화를 표시, 아직 없으면 한국어→영어 번역을 표시 */}
          {lastTop ? (
            <div className="main-text">{lastTop.original}</div>
          ) : lastBottom ? (
            <div className="main-text">{lastBottom.translation}</div>
          ) : (
            <div className="main-text" style={{ opacity: 0.3 }}>...</div>
          )}
          {/* 영어→한국어 번역 확인 텍스트 */}
          {lastTop && (
            <div className="sub-text">{lastTop.translation}</div>
          )}
          {topState === 'translating' && (
            <div className="translating-indicator">
              <i className="fa-solid fa-circle-notch fa-spin"></i> Translating...
            </div>
          )}
          {topState === 'error' && (
            <div className="translation-error">
              <span><i className="fa-solid fa-triangle-exclamation"></i> Translation failed.</span>
              <button className="retry-button" onClick={() => setTopState('idle')}>Retry</button>
            </div>
          )}
        </div>

        <div className="input-controls">
          <button
            className="mode-toggle"
            onClick={() => setTopMode(m => m === 'voice' ? 'text' : 'voice')}
            title={topMode === 'voice' ? 'Switch to text input' : 'Switch to voice input'}
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
                placeholder="Type in English..."
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

      {/* Bottom Pane (Korean) */}
      <div className="pane bottom-pane">
        <div className="lang-label">
          <span>한국어 (Korean)</span>
          <i className="fa-solid fa-expand"></i>
        </div>

        <div className="text-content">
          {lastBottom ? (
            <div className="main-text">{lastBottom.original}</div>
          ) : (
            <div className="main-text" style={{ opacity: 0.3 }}>...</div>
          )}
          {/* 가장 최근 발화가 영어 화자인 경우: 영어→한국어 번역(답변)을 표시 */}
          {lastTop && latestSpeaker === 'top' && (
            <div className="main-text response-text">{lastTop.translation}</div>
          )}
          {/* 한국어 화자가 방금 발화한 경우: 한국어→영어 번역 확인 텍스트 */}
          {lastBottom && latestSpeaker === 'bottom' && (
            <div className="sub-text">{lastBottom.translation}</div>
          )}
          {bottomState === 'translating' && (
            <div className="translating-indicator">
              <i className="fa-solid fa-circle-notch fa-spin"></i> 번역 중...
            </div>
          )}
          {bottomState === 'error' && (
            <div className="translation-error">
              <span><i className="fa-solid fa-triangle-exclamation"></i> 번역에 실패했습니다.</span>
              <button className="retry-button" onClick={() => setBottomState('idle')}>다시 시도</button>
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
            title={bottomMode === 'voice' ? '텍스트 입력으로 전환' : '음성 입력으로 전환'}
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
                placeholder="한국어로 입력하세요..."
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
  )
}

export default App
