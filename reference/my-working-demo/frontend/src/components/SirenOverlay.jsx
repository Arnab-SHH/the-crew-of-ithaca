import React from 'react'

export default function SirenOverlay({ players = {} }) {
  const hasAlert = Object.values(players).some(
    p => p.status === 'warning' || p.status === 'damaged'
  )

  if (!hasAlert) return null

  const isDamaged = Object.values(players).some(p => p.status === 'damaged')

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 60,
        boxShadow: isDamaged
          ? 'inset 0 0 90px 30px rgba(239, 68, 68, 0.45), inset 0 0 180px 70px rgba(220, 38, 38, 0.25)'
          : 'inset 0 0 80px 20px rgba(249, 115, 22, 0.4), inset 0 0 160px 60px rgba(234, 88, 12, 0.2)',
        animation: 'vignette-pulse 0.9s ease-in-out infinite',
      }}
    />
  )
}
