import React from 'react'
import { Flame, Shield, Smartphone } from 'lucide-react'

const STATUS_TEXT = { focused: 'At the helm', warning: 'Siren warning', damaged: 'Lost in the song' }
const STATUS_CLASS = { focused: 'focused', warning: 'warning', damaged: 'distracted' }

function WarningBox({ alert, isSunk }) {
  if (isSunk) {
    return <div className="warning-box"><Flame size={16} /><span><b>The hull is breached.</b> Reset the voyage to sail again.</span></div>
  }
  if (!alert) {
    return <div className="warning-box"><Shield size={16} /><span>All hands focused. The passage is clear.</span></div>
  }
  if (alert.facetimePending) {
    return <div className="warning-box"><Smartphone size={16} /><span><b>{alert.name}</b> is on FaceTime with Captain Odysseus — notes up to the camera to repair the hull.</span></div>
  }
  return (
    <div className="warning-box">
      <Flame size={16} />
      <span><b>{alert.name}</b> is hearing the Sirens{alert.reason ? ` (${alert.reason})` : ''}. Check in with your crewmate.</span>
    </div>
  )
}

export default function CrewPanel({ players, me, alert, isSunk }) {
  const list = Object.values(players)
  return (
    <aside className="side">
      <div className="panel-head"><span>02 &nbsp; THE CREW</span><span>{list.length} / ∞</span></div>
      <div className="crew-list">
        {list.map((p) => (
          <div className="crew" key={p.name}>
            <div className="crew-avatar">{p.name.slice(0, 1).toUpperCase()}</div>
            <div className="crew-name">
              <strong>{p.name}{p.name === me && <small> YOU</small>}</strong>
              <span>
                {p.facetimePending ? '📱 On FaceTime with the Captain'
                  : p.damageLocked ? '⚓ Waiting for the Captain · damage paused'
                  : STATUS_TEXT[p.status] || 'At the helm'}
                {!p.sensorOnline && <em className="crew-tag"> · sensor offline</em>}
              </span>
            </div>
            <span className={`status ${STATUS_CLASS[p.status] || 'focused'}`} />
          </div>
        ))}
      </div>
      <WarningBox alert={alert} isSunk={isSunk} />
    </aside>
  )
}
