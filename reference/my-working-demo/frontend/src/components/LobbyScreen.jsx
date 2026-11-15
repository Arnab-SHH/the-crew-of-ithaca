import React, { useState } from 'react'
import { getSocket } from '../services/socket.js'
import { playJoinSound } from '../services/soundEffects.js'

const AVATARS = [
  { id: 'helmet', emoji: '🪖', label: 'Odysseus' },
  { id: 'owl', emoji: '🦉', label: 'Athena' },
  { id: 'trident', emoji: '🔱', label: 'Poseidon' },
  { id: 'bolt', emoji: '⚡', label: 'Zeus' },
]

export default function LobbyScreen({ onJoined }) {
  const [room, setRoom] = useState('ITHACA_1')
  const [player, setPlayer] = useState('Arnab')
  const [phone, setPhone] = useState('+18175550199')
  const [avatar, setAvatar] = useState('helmet')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')

  function handleJoin(e) {
    if (e) e.preventDefault()
    if (!player.trim()) {
      setError('Enter your nickname!')
      return
    }
    if (!room.trim()) {
      setError('Enter a room PIN!')
      return
    }
    setJoining(true)
    setError('')
    const socket = getSocket()

    const payload = {
      room: room.trim().toUpperCase(),
      player: player.trim(),
      phone: phone.trim(),
      avatar,
    }

    playJoinSound()
    socket.emit('join_room', payload)

    const timer = setTimeout(() => {
      setJoining(false)
      onJoined({ ...payload, roomState: null })
    }, 1500)

    socket.once('room_state_update', (state) => {
      clearTimeout(timer)
      setJoining(false)
      onJoined({ ...payload, roomState: state })
    })
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background stars */}
      {[...Array(24)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: `${(i % 3) * 2 + 2}px`,
          height: `${(i % 3) * 2 + 2}px`,
          borderRadius: '50%',
          background: 'white',
          opacity: 0.15 + (i % 5) * 0.15,
          top: `${(i * 17) % 97}%`,
          left: `${(i * 23) % 97}%`,
          animation: `spin ${(i % 5) + 3}s linear infinite`,
        }} />
      ))}

      <div style={{
        background: 'linear-gradient(145deg, #4c1d95 0%, #1e3a8a 100%)',
        borderRadius: '24px',
        padding: '36px 32px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)',
        border: '2px solid rgba(255,255,255,0.15)',
        animation: 'bounce-in 0.5s ease-out',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '56px', marginBottom: '6px', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}>
            🚢
          </div>
          <h1 style={{
            fontSize: '30px',
            fontWeight: 900,
            background: 'linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24)',
            backgroundSize: '200% auto',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            animation: 'shimmer 2.5s linear infinite',
            letterSpacing: '-0.5px',
          }}>
            The Crew of Ithaca
          </h1>
          <p style={{ color: '#c4b5fd', fontSize: '13px', fontWeight: 700, marginTop: '4px', letterSpacing: '0.5px' }}>
            ⚔️ Co-op Focus Survival · Stay Focused or Sink ⚔️
          </p>
        </div>

        <form onSubmit={handleJoin}>
          {/* Room PIN */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', color: '#e9d5ff', fontSize: '12px', fontWeight: 800, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              🏛️ Room PIN
            </label>
            <input
              type="text"
              value={room}
              onChange={e => setRoom(e.target.value)}
              placeholder="ITHACA_1"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid rgba(167, 139, 250, 0.45)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '18px',
                fontWeight: 800,
                fontFamily: 'inherit',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: '2px',
              }}
            />
          </div>

          {/* Player Nickname */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', color: '#e9d5ff', fontSize: '12px', fontWeight: 800, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              ⚔️ Crew Nickname
            </label>
            <input
              type="text"
              value={player}
              onChange={e => setPlayer(e.target.value)}
              placeholder="Arnab"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid rgba(167, 139, 250, 0.45)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          {/* iPhone Number for Chert */}
          <div style={{ marginBottom: '18px' }}>
            <label style={{ display: 'block', color: '#e9d5ff', fontSize: '12px', fontWeight: 800, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              📱 iPhone Number (Chert iMessage / FaceTime)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+18175550199"
              style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '2px solid rgba(167, 139, 250, 0.45)',
                background: 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 700,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </div>

          {/* Hero Avatar Selection */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{ display: 'block', color: '#e9d5ff', fontSize: '12px', fontWeight: 800, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              🏺 Choose Your Hero
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {AVATARS.map(a => {
                const isSelected = avatar === a.id
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => setAvatar(a.id)}
                    className="btn-chunky"
                    style={{
                      padding: '12px 6px',
                      borderRadius: '14px',
                      border: `3px solid ${isSelected ? '#fbbf24' : 'rgba(255,255,255,0.18)'}`,
                      background: isSelected
                        ? 'linear-gradient(145deg, #7c3aed, #2563eb)'
                        : 'rgba(255,255,255,0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      transform: isSelected ? 'scale(1.06)' : 'scale(1)',
                      boxShadow: isSelected ? '0 4px 18px rgba(251,191,36,0.45)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '28px' }}>{a.emoji}</span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 800,
                      color: isSelected ? '#fbbf24' : '#c4b5fd',
                    }}>
                      {a.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.25)',
              border: '1px solid #ef4444',
              borderRadius: '10px',
              padding: '10px',
              marginBottom: '16px',
              color: '#fca5a5',
              fontSize: '13px',
              fontWeight: 700,
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          {/* Chunky Board Button */}
          <button
            type="submit"
            disabled={joining}
            className="btn-chunky"
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '14px',
              border: 'none',
              background: joining
                ? 'linear-gradient(145deg, #6b7280, #4b5563)'
                : 'linear-gradient(145deg, #10b981, #059669)',
              color: '#fff',
              fontSize: '20px',
              fontWeight: 900,
              fontFamily: 'inherit',
              letterSpacing: '1px',
              boxShadow: joining ? 'none' : '0 6px 24px rgba(16, 185, 129, 0.45)',
            }}
          >
            {joining ? '⏳ BOARDING SHIP...' : '🚢 BOARD THE SHIP!'}
          </button>
        </form>
      </div>
    </div>
  )
}
