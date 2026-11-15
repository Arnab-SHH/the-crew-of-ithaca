import React, { useState, useEffect, useRef } from 'react'

function getBarColor(pct) {
  if (pct > 60) return '#10b981'
  if (pct > 30) return '#f59e0b'
  return '#ef4444'
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function HullHealthBar({ hullHealth = 100, maxHealth = 100, muted = false, onToggleMute, roomCode = 'ITHACA_1' }) {
  const pct = Math.max(0, Math.min(100, Math.round((hullHealth / maxHealth) * 100)))
  const color = getBarColor(pct)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const studyLimit = 25 * 60
  const remaining = Math.max(0, studyLimit - elapsed)

  return (
    <header style={{
      background: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(16px)',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '20px',
      borderBottom: '2px solid rgba(255,255,255,0.1)',
      flexWrap: 'wrap',
      zIndex: 40,
    }}>
      {/* Ship & Room Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
        <span style={{ fontSize: '28px', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.4))' }}>🚢</span>
        <div>
          <div style={{ fontWeight: 900, fontSize: '16px', color: '#fbbf24', letterSpacing: '0.5px' }}>
            THE ODYSSEY
          </div>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>
            ROOM: {roomCode}
          </div>
        </div>
      </div>

      {/* Hull HP Bar */}
      <div style={{ flex: 1, minWidth: '220px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
          <span style={{ fontSize: '12px', fontWeight: 900, color: color, textTransform: 'uppercase', letterSpacing: '1px' }}>
            ⚓ SHIP HULL INTEGRITY
          </span>
          <span style={{ fontSize: '13px', fontWeight: 900, color: color, fontVariantNumeric: 'tabular-nums' }}>
            {hullHealth} / {maxHealth} HP ({pct}%)
          </span>
        </div>
        <div style={{
          height: '22px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '999px',
          overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.6)',
          position: 'relative',
        }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
            borderRadius: '999px',
            transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1), background 0.4s ease',
            position: 'relative',
            boxShadow: `0 0 16px ${color}88`,
          }}>
            {/* Gloss highlight */}
            <div style={{
              position: 'absolute',
              top: '1px',
              left: '4px',
              right: '4px',
              height: '40%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.05) 100%)',
              borderRadius: '999px',
            }} />
          </div>
        </div>
      </div>

      {/* 25:00 Pomodoro / Focus Timer */}
      <div style={{
        background: 'rgba(255,255,255,0.07)',
        borderRadius: '12px',
        padding: '6px 16px',
        border: '1px solid rgba(255,255,255,0.15)',
        textAlign: 'center',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
          ⏱️ FOCUS VOYAGE
        </div>
        <div style={{
          fontSize: '22px',
          fontWeight: 900,
          color: remaining < 300 ? '#ef4444' : '#fff',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '1px',
        }}>
          {formatTime(remaining)}
        </div>
      </div>

      {/* Sound Mute Toggle */}
      <button
        type="button"
        onClick={onToggleMute}
        className="btn-chunky"
        style={{
          background: muted ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
          border: '2px solid rgba(255,255,255,0.2)',
          borderRadius: '12px',
          padding: '8px 14px',
          color: '#fff',
          fontSize: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        title={muted ? 'Unmute arcade sound effects' : 'Mute sound effects'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </header>
  )
}
