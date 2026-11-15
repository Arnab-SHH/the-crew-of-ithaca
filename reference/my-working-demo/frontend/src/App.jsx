import React, { useState, useEffect, useRef } from 'react'
import { getSocket } from './services/socket.js'
import {
  playWarningSound,
  playDamageSound,
  playRecoverySound,
  playGameOverSound,
} from './services/soundEffects.js'
import LobbyScreen from './components/LobbyScreen.jsx'
import HullHealthBar from './components/HullHealthBar.jsx'
import ShipCanvas from './components/ShipCanvas.jsx'
import CrewRoster from './components/CrewRoster.jsx'
import SirenOverlay from './components/SirenOverlay.jsx'
import GameOverModal from './components/GameOverModal.jsx'

export default function App() {
  const [phase, setPhase] = useState('lobby') // 'lobby' | 'game'
  const [session, setSession] = useState(null) // { room, player, phone, avatar }
  const [roomState, setRoomState] = useState(null)
  const [muted, setMuted] = useState(false)
  const [demoExpanded, setDemoExpanded] = useState(true)

  const prevStateRef = useRef(null)

  // Listen for real-time room updates from Socket.io server
  useEffect(() => {
    if (phase !== 'game') return
    const socket = getSocket()

    function handleRoomState(state) {
      const prev = prevStateRef.current

      if (!muted && prev) {
        const currentPlayers = state.players || {}
        const prevPlayers = prev.players || {}

        // Sound triggers based on delta
        for (const [name, p] of Object.entries(currentPlayers)) {
          const pp = prevPlayers[name]
          if (!pp) continue
          if (pp.status !== 'warning' && p.status === 'warning') {
            playWarningSound()
          }
          if (pp.status !== 'damaged' && p.status === 'damaged') {
            playDamageSound()
          }
          if ((pp.status === 'warning' || pp.status === 'damaged') && p.status === 'focused') {
            playRecoverySound()
          }
        }

        if (!prev.isSunk && state.isSunk) {
          playGameOverSound()
        }
      }

      prevStateRef.current = state
      setRoomState(state)
    }

    socket.on('room_state_update', handleRoomState)

    return () => {
      socket.off('room_state_update', handleRoomState)
    }
  }, [phase, muted])

  function handleJoined({ room, player, phone, avatar, roomState: initial }) {
    setSession({ room, player, phone, avatar })
    if (initial) {
      setRoomState(initial)
      prevStateRef.current = initial
    }
    setPhase('game')
  }

  function handleReset() {
    if (!session) return
    getSocket().emit('reset_voyage', { room: session.room })
  }

  // --- Demo Control Bar Triggers ---
  function demoWarning() {
    if (!session) return
    getSocket().emit('siren_warning', {
      room: session.room,
      player: session.player,
      phone: session.phone,
      reason: 'Looking Down at Phone',
    })
  }

  function demoDamage() {
    if (!session) return
    getSocket().emit('take_damage', {
      room: session.room,
      player: session.player,
      phone: session.phone,
      damage: 10,
      reason: 'Looking Down at Phone',
    })
  }

  function demoRecover() {
    if (!session) return
    getSocket().emit('player_recovered', {
      room: session.room,
      player: session.player,
    })
  }

  if (phase === 'lobby') {
    return <LobbyScreen onJoined={handleJoined} />
  }

  const players = roomState?.players || {}
  const hullHealth = roomState?.hullHealth ?? 100
  const maxHealth = roomState?.maxHealth ?? 100
  const isSunk = roomState?.isSunk ?? false
  const lastEvent = roomState?.lastEvent ?? null

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Red/Orange Siren Alert Vignette */}
      <SirenOverlay players={players} />

      {/* Top Hull Health Bar & Study Timer */}
      <HullHealthBar
        hullHealth={hullHealth}
        maxHealth={maxHealth}
        muted={muted}
        onToggleMute={() => setMuted(m => !m)}
        roomCode={session?.room || 'ITHACA_1'}
      />

      {/* Center 2D Ship Stage & Bobbing Ocean */}
      <ShipCanvas lastEvent={lastEvent} isSunk={isSunk} />

      {/* Bottom Crew Roster Dock (Circular Avatars - Zero webcam feed) */}
      <CrewRoster players={players} />

      {/* Collapsible Demo Control Bar (Bottom-Right) */}
      <div style={{
        position: 'fixed',
        bottom: '100px',
        right: '20px',
        background: 'rgba(15, 23, 42, 0.9)',
        backdropFilter: 'blur(16px)',
        border: '2px solid rgba(255,255,255,0.15)',
        borderRadius: '16px',
        padding: '14px',
        zIndex: 80,
        boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
        width: demoExpanded ? '240px' : 'auto',
        transition: 'all 0.2s ease',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }} onClick={() => setDemoExpanded(!demoExpanded)}>
          <span style={{
            fontSize: '11px',
            fontWeight: 900,
            color: '#fbbf24',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
          }}>
            🎮 DEMO CONTROLS
          </span>
          <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 800, marginLeft: '8px' }}>
            {demoExpanded ? '▼' : '▲'}
          </span>
        </div>

        {demoExpanded && (
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              onClick={demoWarning}
              className="btn-chunky"
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(249, 115, 22, 0.2)',
                color: '#fb923c',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 800,
                textAlign: 'left',
                borderLeft: '4px solid #f97316',
              }}
            >
              ⚠️ Trigger Warning
            </button>

            <button
              type="button"
              onClick={demoDamage}
              className="btn-chunky"
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#f87171',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 800,
                textAlign: 'left',
                borderLeft: '4px solid #ef4444',
              }}
            >
              💥 Trigger -10 HP Damage
            </button>

            <button
              type="button"
              onClick={demoRecover}
              className="btn-chunky"
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 800,
                textAlign: 'left',
                borderLeft: '4px solid #10b981',
              }}
            >
              ✅ Recover / Focused
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="btn-chunky"
              style={{
                padding: '9px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'rgba(124, 58, 237, 0.25)',
                color: '#c084fc',
                fontFamily: 'inherit',
                fontSize: '12px',
                fontWeight: 800,
                textAlign: 'left',
                borderLeft: '4px solid #7c3aed',
              }}
            >
              🔄 Reset Ship (100 HP)
            </button>

            {session && (
              <div style={{
                marginTop: '4px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                fontSize: '11px',
                color: '#94a3b8',
                textAlign: 'center',
              }}>
                Crewmate: <strong style={{ color: '#fbbf24' }}>{session.player}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sunk / Game Over Modal */}
      <GameOverModal roomState={roomState} onReset={handleReset} />
    </div>
  )
}
