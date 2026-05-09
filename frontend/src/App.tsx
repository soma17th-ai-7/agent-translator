import { useState } from 'react'
import './index.css'

type InputMode = 'voice' | 'text'

function App() {
  const [step, setStep] = useState(0)
  const [isBottomListening, setIsBottomListening] = useState(false)
  const [isTopListening, setIsTopListening] = useState(false)
  const [showAgent, setShowAgent] = useState(false)
  const [bottomMode, setBottomMode] = useState<InputMode>('voice')
  const [topMode, setTopMode] = useState<InputMode>('voice')
  const [bottomDraft, setBottomDraft] = useState('')
  const [topDraft, setTopDraft] = useState('')
  const [bottomMessage, setBottomMessage] = useState('')
  const [topMessage, setTopMessage] = useState('')

  // Step 0: Initial
  // Step 1: Bottom User Spoke/Typed
  // Step 2: Translation appears on top pane
  // Step 3: Top User Spoke/Typed
  // Step 4: Back-translation appears on bottom pane
  // Step 5: Agent Fact Check

  const BOTTOM_TRANSLATION = 'How much is the taxi fare to the airport?'
  const TOP_TRANSLATION = '50달러입니다.'

  const advanceFromBottom = (message: string) => {
    setBottomMessage(message)
    setStep(1)
    setTimeout(() => setStep(2), 1000)
  }

  const advanceFromTop = (message: string) => {
    setTopMessage(message)
    setStep(3)
    setTimeout(() => {
      setStep(4)
      setTimeout(() => setShowAgent(true), 1500)
    }, 1000)
  }

  const handleBottomMicClick = () => {
    if (step !== 0) return
    setIsBottomListening(true)
    setTimeout(() => {
      setIsBottomListening(false)
      advanceFromBottom('공항까지 가는데 택시비가 얼마예요?')
    }, 1500)
  }

  const handleBottomTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!bottomDraft.trim() || step !== 0) return
    advanceFromBottom(bottomDraft.trim())
    setBottomDraft('')
  }

  const handleTopMicClick = () => {
    if (step !== 2) return
    setIsTopListening(true)
    setTimeout(() => {
      setIsTopListening(false)
      advanceFromTop("It's 50 dollars.")
    }, 1500)
  }

  const handleTopTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topDraft.trim() || step !== 2) return
    advanceFromTop(topDraft.trim())
    setTopDraft('')
  }

  const resetConversation = () => {
    setStep(0)
    setShowAgent(false)
    setBottomMessage('')
    setTopMessage('')
  }

  return (
    <div className="app-container">
      {/* Top Pane (English) */}
      <div className="pane top-pane">
        <div className="lang-label">
          <span>English (US)</span>
          <i className="fa-solid fa-expand"></i>
        </div>

        <div className="text-content">
          {step >= 3 && (
            <div className="main-text">{topMessage}</div>
          )}
          {step >= 2 && step < 3 && (
            <div className="main-text">{BOTTOM_TRANSLATION}</div>
          )}
          {step >= 4 && (
            <div className="sub-text">{TOP_TRANSLATION}</div>
          )}
          {step < 2 && <div className="main-text" style={{opacity: 0.3}}>...</div>}
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
                disabled={step !== 2}
              />
              <button
                className="send-button top-send"
                type="submit"
                disabled={step !== 2 || !topDraft.trim()}
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
          {step >= 1 && (
            <div className="main-text">{bottomMessage}</div>
          )}
          {step >= 2 && step < 3 && (
            <div className="sub-text">{BOTTOM_TRANSLATION}</div>
          )}
          {step >= 4 && (
            <div className="main-text">{TOP_TRANSLATION}</div>
          )}
          {step === 0 && <div className="main-text" style={{opacity: 0.3}}>...</div>}

          {showAgent && (
            <div className="subtle-agent-note" onClick={resetConversation} style={{ cursor: 'pointer' }}>
              <i className="fa-solid fa-circle-info"></i>
              <div>
                <strong>현지 시세 정보</strong><br/>
                공항-시내 간 통상 요금은 $20~$25 입니다.<br/>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>(클릭하여 다시 시작)</span>
              </div>
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
                disabled={step !== 0}
              />
              <button
                className="send-button bottom-send"
                type="submit"
                disabled={step !== 0 || !bottomDraft.trim()}
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
