import React from 'react'

const AVATAR_MAP = {
  helmet: '🪖',
  owl: '🦉',
  trident: '🔱',
  bolt: '⚡',
}

function StatusPill({ status }) {
  if (status === 'warning') {
    return (
      <span style={{
        background: '#f97316',
        color: '#fff',
        borderRadius: '999px',
        padding: '2px 8px',
        fontSize: '10px',
        fontWeight: 900,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        boxShadow: '0 2px 6px rgba(249, 115, 22, 0.5)',
      }}>
        ⚠️ SIRENS!
      </span>
    )
  }
  if (status === 'damaged') {
    return (
      <span style={{
        background: '#ef4444',
        color: '#fff',
        borderRadius: '999px',
        padding: '2px 8px',
        fontSize: '10px',
        fontWeight: 900,
        letterSpacing: '0.5px',
        textTransform: 'uppercase',
        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5)',
      }}>
        💥 -10 HP!
      </span>
    )
  }
  return (
    <span style={{
      background: '#10b981',
      color: '#fff',
      borderRadius: '999px',
      padding: '2px 8px',
      fontSize: '10px',
      fontWeight: 900,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      boxShadow: '0 2px 6px rgba(16, 185, 129, 0.5)',
    }}>
      🛡️ FOCUSED
    </span>
  )
}

function PlayerBadge({ name, data }) {
  const { avatar = 'helmet', status = 'focused', reason = '', penalties = 0 } = data
  const emoji = AVATAR_MAP[avatar] || '🪖'

  const isWarning = status === 'warning'
  const isDamaged = status === 'damaged'
  const isFocused = !isWarning && !isDamaged

  const ringBorder = isFocused
    ? '4px solid #10b981'
    : isWarning
      ? '4px solid #f97316'
      : '4px solid #ef4444'

  const ringAnimation = isFocused
    ? 'glow-green 2.5s ease-in-out infinite'
    : isWarning
      ? 'pulse-ring 0.9s ease-out infinite'
      : 'pulse-red 0.5s ease-out infinite'

  const avatarAnim = isWarning ? 'avatar-bounce 0.6s ease infinite' : 'none'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
      position: 'relative',
      minWidth: '100px',
    }}>
      {/* Comic Speech Bubble for Warning / Damage */}
      {(isWarning || isDamaged) && reason && (
        <div style={{
          position: 'absolute',
          top: '-58px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: isWarning ? '#ea580c' : '#dc2626',
          borderRadius: '12px',
          padding: '6px 12px',
          fontSize: '11px',
          fontWeight: 900,
          color: '#fff',
          whiteSpace: 'nowrap',
          maxWidth: '190px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          zIndex: 35,
          boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          border: '2px solid rgba(255,255,255,0.4)',
          animation: 'bounce-in 0.3s ease-out',
        }}>
          {isWarning ? `⚠️ SIRENS! (${reason})` : `💥 HIT! (${reason})`}
          {/* Comic Pointer Arrow */}
          <div style={{
            position: 'absolute',
            bottom: '-7px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop: `7px solid ${isWarning ? '#ea580c' : '#dc2626'}`,
          }} />
        </div>
      )}

      {/* Large Kahoot-style Circular Avatar Badge */}
      <div style={{
        width: '84px',
        height: '84px',
        borderRadius: '50%',
        background: isFocused
          ? 'linear-gradient(145deg, rgba(16, 185, 129, 0.25), rgba(16, 185, 129, 0.05))'
          : isWarning
            ? 'linear-gradient(145deg, rgba(249, 115, 22, 0.35), rgba(249, 115, 22, 0.1))'
            : 'linear-gradient(145deg, rgba(239, 68, 68, 0.4), rgba(239, 68, 68, 0.15))',
        border: ringBorder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '40px',
        animation: `${ringAnimation}, ${avatarAnim}`,
        position: 'relative',
        userSelect: 'none',
        transition: 'all 0.3s ease',
      }}>
        {emoji}

        {/* Penalty Counter Badge */}
        {penalties > 0 && (
          <div style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            fontSize: '11px',
            fontWeight: 900,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #1a0533',
            boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
          }}>
            {penalties}
          </div>
        )}
      </div>

      {/* Name Label */}
      <div style={{
        fontSize: '14px',
        fontWeight: 900,
        color: '#f8fafc',
        textAlign: 'center',
        textShadow: '0 1px 3px rgba(0,0,0,0.6)',
      }}>
        {name}
      </div>

      {/* Status Pill */}
      <StatusPill status={status} />
    </div>
  )
}

export default function CrewRoster({ players = {} }) {
  const entries = Object.entries(players)

  return (
    <footer style={{
      background: 'rgba(15, 23, 42, 0.85)',
      backdropFilter: 'blur(16px)',
      borderTop: '2px solid rgba(255,255,255,0.1)',
      padding: '20px 24px 28px',
      zIndex: 40,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '14px',
      }}>
        <div style={{
          fontSize: '12px',
          fontWeight: 900,
          color: '#a5b4fc',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          🛡️ CREW ROSTER ({entries.length} ONBOARD)
        </div>
        <div style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#94a3b8',
        }}>
          All crew members must stay focused to survive
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{
          padding: '20px',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '14px',
          fontWeight: 700,
        }}>
          Waiting for crewmates to board the ship...
        </div>
      ) : (
        <div style={{
          display: 'flex',
          gap: '24px',
          justifyContent: 'center',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          overflowX: 'auto',
          padding: '6px 0',
        }}>
          {entries.map(([name, data]) => (
            <PlayerBadge key={name} name={name} data={data} />
          ))}
        </div>
      )}
    </footer>
  )
}
