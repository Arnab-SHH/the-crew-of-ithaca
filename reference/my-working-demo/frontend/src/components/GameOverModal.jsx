import React from 'react'

export default function GameOverModal({ roomState, onReset }) {
  if (!roomState || !roomState.isSunk) return null

  const players = roomState.players || {}
  const sorted = Object.values(players).sort((a, b) => (b.penalties || 0) - (a.penalties || 0))
  const topDistracted = sorted[0]

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(10, 15, 30, 0.88)',
      backdropFilter: 'blur(10px)',
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #1e1b4b, #0f172a)',
        borderRadius: '24px',
        padding: '36px 32px',
        maxWidth: '480px',
        width: '100%',
        textAlign: 'center',
        border: '3px solid rgba(239,68,68,0.6)',
        boxShadow: '0 0 70px rgba(239,68,68,0.35), 0 25px 50px rgba(0,0,0,0.8)',
        animation: 'bounce-in 0.5s ease-out',
      }}>
        <div style={{ fontSize: '64px', marginBottom: '8px', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' }}>
          💀
        </div>
        <h2 style={{
          fontSize: '32px',
          fontWeight: 900,
          color: '#ef4444',
          marginBottom: '6px',
          letterSpacing: '-0.5px',
        }}>
          THE SHIP HAS SUNK!
        </h2>
        <p style={{ color: '#cbd5e1', marginBottom: '22px', fontSize: '14px', fontWeight: 600 }}>
          The Sirens broke the crew's concentration and swallowed the vessel whole.
        </p>

        {/* Podium / Roster Leaderboard */}
        <div style={{
          background: 'rgba(0,0,0,0.35)',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{
            fontSize: '12px',
            color: '#fbbf24',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '12px',
          }}>
            🏛️ SIREN INFRACTION LOG
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sorted.map((p, idx) => (
              <div
                key={p.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: idx === 0 && p.penalties > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                  border: idx === 0 && p.penalties > 0 ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span style={{ fontSize: '20px' }}>
                  {idx === 0 && p.penalties > 0 ? '🚨' : '🛡️'}
                </span>
                <span style={{
                  fontWeight: 900,
                  fontSize: '15px',
                  flex: 1,
                  textAlign: 'left',
                  color: '#f8fafc',
                }}>
                  {p.name}
                </span>
                <span style={{
                  background: p.penalties > 0 ? '#ef4444' : '#10b981',
                  color: '#fff',
                  borderRadius: '999px',
                  padding: '3px 10px',
                  fontSize: '12px',
                  fontWeight: 900,
                }}>
                  {p.penalties} penalties (-{p.penalties * 10} HP)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Offender Callout */}
        {topDistracted && topDistracted.penalties > 0 && (
          <div style={{
            background: 'rgba(239,68,68,0.15)',
            borderRadius: '12px',
            padding: '12px',
            marginBottom: '24px',
            fontSize: '13px',
            color: '#fca5a5',
            fontWeight: 700,
            border: '1px solid rgba(239,68,68,0.3)',
          }}>
            ⚠️ <strong>{topDistracted.name}</strong> was lured by the Sirens most ({topDistracted.penalties} times)!
          </div>
        )}

        {/* Sail Again Button */}
        <button
          type="button"
          onClick={onReset}
          className="btn-chunky"
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: '14px',
            border: 'none',
            background: 'linear-gradient(145deg, #7c3aed, #2563eb)',
            color: '#fff',
            fontSize: '20px',
            fontWeight: 900,
            fontFamily: 'inherit',
            letterSpacing: '1px',
            boxShadow: '0 6px 25px rgba(124,58,237,0.5)',
          }}
        >
          ⚓ SAIL AGAIN (RESET VOYAGE)
        </button>
      </div>
    </div>
  )
}
