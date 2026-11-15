import React, { useEffect, useState } from 'react'
import { Shield, ShieldCheck, Users, Timer } from 'lucide-react'

const fmt = (ms) => {
  const n = Math.max(0, Math.ceil(ms / 1000))
  return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
}

export default function StatsBar({ hull, maxHealth, crewCount, started, remain, lastEvent }) {
  // +10 HP shield animation whenever a FaceTime verification heals the hull
  const [healKey, setHealKey] = useState(null)
  const healStamp = lastEvent?.type === 'healed' ? lastEvent.timestamp : null
  useEffect(() => {
    if (!healStamp) return
    setHealKey(healStamp)
    const t = setTimeout(() => setHealKey(null), 2200)
    return () => clearTimeout(t)
  }, [healStamp])

  const pct = Math.round((hull / (maxHealth || 100)) * 100)

  return (
    <section className="stats">
      <div>
        <small>VOYAGE TIME</small>
        <strong><Timer size={18} />{started ? fmt(remain) : '25:00'}</strong>
      </div>
      <div className={`hull-stat ${healKey ? 'healing' : ''}`}>
        <small>HULL INTEGRITY</small>
        <strong>{healKey ? <ShieldCheck size={18} /> : <Shield size={18} />}{hull}<em> / {maxHealth || 100}</em></strong>
        <div className="health"><span style={{ width: `${pct}%` }} /></div>
        {healKey && <span key={healKey} className="heal-pop"><ShieldCheck size={13} /> +10 HP</span>}
      </div>
      <div>
        <small>CREW ABOARD</small>
        <strong><Users size={18} />{crewCount}<em> SAILORS</em></strong>
      </div>
    </section>
  )
}
