import { useState, useEffect } from 'react'
import './index.css'

function App() {
  const [step, setStep] = useState(0)
  const [isBottomListening, setIsBottomListening] = useState(false)
  const [isTopListening, setIsTopListening] = useState(false)
  const [showAgent, setShowAgent] = useState(false)

  // Step 0: Initial
  // Step 1: Bottom User Spoke -> "공항까지 가는데 택시비가 얼마예요?"
  // Step 2: Top User Translated -> "How much is the taxi fare to the airport?"
  // Step 3: Top User Spoke -> "It's 50 dollars."
  // Step 4: Bottom User Translated -> "50달러입니다."
  // Step 5: Agent Fact Check

  const handleBottomMicClick = () => {
    if (step !== 0) return
    setIsBottomListening(true)
    setTimeout(() => {
      setIsBottomListening(false)
      setStep(1) // Korean text appears
      
      setTimeout(() => {
        setStep(2) // Translation appears on top
      }, 1000)
    }, 1500)
  }

  const handleTopMicClick = () => {
    if (step !== 2) return
    setIsTopListening(true)
    setTimeout(() => {
      setIsTopListening(false)
      setStep(3) // English text appears
      
      setTimeout(() => {
        setStep(4) // Translation appears on bottom
        
        setTimeout(() => {
          setShowAgent(true) // Agent intervention
        }, 1500)
      }, 1000)
    }, 1500)
  }

  const resetConversation = () => {
    setStep(0)
    setShowAgent(false)
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
            <div className="main-text">It's 50 dollars.</div>
          )}
          {step >= 2 && step < 3 && (
            <div className="main-text">How much is the taxi fare to the airport?</div>
          )}
          {step >= 4 && (
            <div className="sub-text">50달러입니다.</div>
          )}
          {step < 2 && <div className="main-text" style={{opacity: 0.3}}>...</div>}
        </div>

        <div className="mic-controls">
          <div 
            className={`mic-button top-mic ${isTopListening ? 'listening' : ''}`}
            onClick={handleTopMicClick}
          >
            <i className="fa-solid fa-microphone"></i>
          </div>
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
            <div className="main-text">공항까지 가는데 택시비가 얼마예요?</div>
          )}
          {step >= 2 && step < 3 && (
            <div className="sub-text">How much is the taxi fare to the airport?</div>
          )}
          {step >= 4 && (
            <div className="main-text">50달러입니다.</div>
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

        <div className="mic-controls">
          <div 
            className={`mic-button bottom-mic ${isBottomListening ? 'listening' : ''}`}
            onClick={handleBottomMicClick}
          >
            <i className="fa-solid fa-microphone"></i>
          </div>
        </div>
      </div>

    </div>
  )
}

export default App
