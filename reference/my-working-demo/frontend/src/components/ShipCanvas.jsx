import React, { useState, useEffect } from 'react'

export default function ShipCanvas({ lastEvent, isSunk = false }) {
  const [shaking, setShaking] = useState(false)
  const [splashing, setSplashing] = useState(false)
  const [popups, setPopups] = useState([])

  useEffect(() => {
    if (!lastEvent) return
    if (lastEvent.type === 'damage') {
      setShaking(true)
      setSplashing(true)

      const id = Date.now() + Math.random()
      const newPopup = {
        id,
        text: `-10 HP!`,
        reason: lastEvent.reason || 'Distraction',
        player: lastEvent.player || 'Crewmate',
      }
      setPopups(prev => [...prev.slice(-3), newPopup])

      const shakeTimer = setTimeout(() => setShaking(false), 700)
      const splashTimer = setTimeout(() => setSplashing(false), 900)
      const popupTimer = setTimeout(() => {
        setPopups(prev => prev.filter(p => p.id !== id))
      }, 1600)

      return () => {
        clearTimeout(shakeTimer)
        clearTimeout(splashTimer)
        clearTimeout(popupTimer)
      }
    }
  }, [lastEvent])

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      minHeight: '320px',
      background: 'radial-gradient(circle at 50% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
    }}>
      {/* Sky details: Distant clouds or Greek islands */}
      <div style={{
        position: 'absolute',
        top: '15%',
        left: '10%',
        fontSize: '42px',
        opacity: 0.35,
        filter: 'blur(1px)',
        userSelect: 'none',
      }}>
        ☁️
      </div>
      <div style={{
        position: 'absolute',
        top: '25%',
        right: '12%',
        fontSize: '36px',
        opacity: 0.3,
        filter: 'blur(1px)',
        userSelect: 'none',
      }}>
        ☁️
      </div>

      {/* Floating Damage Popups */}
      {popups.map(p => (
        <div
          key={p.id}
          className="damage-popup"
          style={{
            position: 'absolute',
            top: '32%',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            zIndex: 30,
            textShadow: '0 4px 12px rgba(0,0,0,0.8)',
          }}
        >
          <span style={{
            fontSize: '42px',
            fontWeight: 900,
            color: '#ef4444',
            letterSpacing: '1px',
            filter: 'drop-shadow(0 0 16px rgba(239,68,68,0.9))',
          }}>
            💥 {p.text}
          </span>
          <span style={{
            fontSize: '14px',
            fontWeight: 800,
            background: 'rgba(239,68,68,0.85)',
            color: '#fff',
            padding: '3px 12px',
            borderRadius: '999px',
            marginTop: '4px',
          }}>
            {p.player}: {p.reason}
          </span>
        </div>
      ))}

      {/* Red Splash Flash Overlay on damage */}
      {splashing && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle, rgba(239, 68, 68, 0.45) 0%, rgba(239, 68, 68, 0.1) 60%, transparent 90%)',
          animation: 'splash 0.8s ease-out forwards',
          zIndex: 15,
          pointerEvents: 'none',
        }} />
      )}

      {/* Trireme Vessel */}
      <div style={{
        position: 'relative',
        zIndex: 10,
        animation: isSunk
          ? 'none'
          : shaking
            ? 'shake 0.7s cubic-bezier(.36,.07,.19,.97) both'
            : 'bob 3.2s ease-in-out infinite',
        transform: isSunk ? 'translateY(110px) rotate(32deg) scale(0.85)' : 'translateY(0) rotate(0)',
        opacity: isSunk ? 0.35 : 1,
        transition: 'transform 1.4s ease, opacity 1.4s ease',
        userSelect: 'none',
      }}>
        {/* SVG Greek Trireme with sail, oars, eye of Horus / Odysseus emblem */}
        <svg
          width="260"
          height="200"
          viewBox="0 0 260 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.5))' }}
        >
          {/* Mast */}
          <rect x="126" y="24" width="8" height="110" rx="3" fill="#78350f" />

          {/* Crossbeam */}
          <rect x="70" y="38" width="120" height="6" rx="2" fill="#92400e" />

          {/* Majestic Sail */}
          <path
            d="M 74 44 Q 130 50 186 44 Q 160 100 130 112 Q 100 100 74 44 Z"
            fill="url(#sailGradient)"
            stroke="#fbbf24"
            strokeWidth="3"
          />

          {/* Sail Greek Meander / Trident Emblem */}
          <path
            d="M 130 62 L 130 92 M 122 70 L 130 62 L 138 70 M 118 78 L 122 70 M 142 78 L 138 70"
            stroke="#1e3a8a"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Pennant Flag */}
          <polygon points="134,24 165,30 134,36" fill="#ef4444" />

          {/* Hull of the Ship */}
          <path
            d="M 28 132 C 45 155 80 168 130 168 C 180 168 215 155 242 124 C 215 136 175 140 130 140 C 75 140 45 134 28 132 Z"
            fill="#9a3412"
            stroke="#78350f"
            strokeWidth="3"
          />

          {/* Hull upper deck railing with gold studs */}
          <path
            d="M 32 134 Q 130 144 235 127"
            stroke="#f59e0b"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Battering Ram (Prow) */}
          <polygon points="238,130 258,145 235,148" fill="#fbbf24" stroke="#d97706" strokeWidth="2" />

          {/* Steer Oars */}
          <line x1="60" y1="145" x2="35" y2="185" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
          <line x1="85" y1="148" x2="65" y2="185" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <line x1="110" y1="150" x2="95" y2="185" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <line x1="135" y1="150" x2="125" y2="185" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <line x1="160" y1="148" x2="155" y2="185" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />
          <line x1="185" y1="145" x2="185" y2="185" stroke="#78350f" strokeWidth="3" strokeLinecap="round" />

          {/* Protective Eye of Ithaca on Prow */}
          <circle cx="215" cy="142" r="7" fill="#fff" stroke="#1e293b" strokeWidth="2" />
          <circle cx="216" cy="142" r="3.5" fill="#2563eb" />

          {/* Gradients */}
          <defs>
            <linearGradient id="sailGradient" x1="74" y1="44" x2="186" y2="112" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fef08a" />
              <stop offset="0.5" stopColor="#fef9c3" />
              <stop offset="1" stopColor="#fde047" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Animated 2D Cartoon Waves (Kahoot / CrazyGames Arcade Ocean) */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '110px',
        overflow: 'hidden',
        pointerEvents: 'none',
      }}>
        {/* Wave Layer 1 */}
        <div style={{
          position: 'absolute',
          bottom: '22px',
          width: '200%',
          height: '60px',
          animation: 'wave 5s linear infinite',
          opacity: 0.65,
        }}>
          <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <path
              d="M0,25 C150,55 350,5 600,25 C850,45 1050,10 1200,25 L1200,60 L0,60 Z"
              fill="#2563eb"
            />
          </svg>
        </div>

        {/* Wave Layer 2 */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
          width: '200%',
          height: '65px',
          animation: 'wave 7s linear infinite reverse',
          opacity: 0.85,
        }}>
          <svg viewBox="0 0 1200 65" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
            <path
              d="M0,35 C200,10 400,50 600,35 C800,20 1000,55 1200,35 L1200,65 L0,65 Z"
              fill="#1d4ed8"
            />
          </svg>
        </div>

        {/* Deep Ocean Floor Strip */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '24px',
          background: 'linear-gradient(180deg, #1d4ed8 0%, #0f172a 100%)',
        }} />
      </div>
    </div>
  )
}
