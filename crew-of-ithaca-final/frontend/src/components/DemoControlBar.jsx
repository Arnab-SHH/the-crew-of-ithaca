import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { socket } from '../services/socket.js'

const REASON = 'Looking Down at Phone'

// Collapsible judge/demo controls: fire every game event for the local player.
export default function DemoControlBar({ room, player, phone }) {
  const [open, setOpen] = useState(false)

  const actions = [
    ['⚠️ Siren warning', 'siren_warning', { room, player, phone, reason: REASON }],
    ['💥 Take −10 HP', 'take_damage', { room, player, phone, damage: 10, reason: REASON }],
    ['📱 FaceTime verified +10', 'facetime_verified', { room, player, verified: true, observedItem: 'Study Notes / Notebook' }],
    ['✅ Player recovered', 'player_recovered', { room, player }],
    ['🔄 Reset voyage', 'reset_voyage', { room }],
  ]

  return (
    <div className={`demo-bar ${open ? 'open' : ''}`}>
      <button type="button" className="demo-head" onClick={() => setOpen(!open)}>
        <span>DEMO CONTROLS</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="demo-actions">
          {actions.map(([label, event, payload]) => (
            <button key={event} type="button" className="secondary" onClick={() => socket.emit(event, payload)}>{label}</button>
          ))}
          <small>Acting as <b>{player}</b></small>
        </div>
      )}
    </div>
  )
}
