import React from 'react'
import { Anchor } from 'lucide-react'

export default function TopBar({ name, active }) {
  return (
    <header className="top">
      <div className="brand">
        <span className="mark"><Anchor size={19} /></span>
        <span>ITHACA <small>THE FOCUS VOYAGE</small></span>
      </div>
      <div className="top-right">
        <span className="live-dot" /> CREW LINK {active ? 'ACTIVE' : 'STANDBY'}{' '}
        <span className="avatar">{name ? name.slice(0, 1).toUpperCase() : '·'}</span>
      </div>
    </header>
  )
}
