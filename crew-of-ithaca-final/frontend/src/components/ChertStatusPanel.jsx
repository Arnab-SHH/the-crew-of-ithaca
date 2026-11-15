import React from 'react'
import { Smartphone, ShieldCheck } from 'lucide-react'

// Chert FaceTime verification status (uses the friend-ui sponsor panel styling)
export default function ChertStatusPanel({ players, lastEvent }) {
  const onCall = Object.values(players).filter((p) => p.facetimePending)
  const healed = lastEvent?.type === 'healed' ? lastEvent : null

  return (
    <section className="sponsor-settings chert-panel">
      <div>
        <span className="eyebrow">CHERT CHECK-IN · CAPTAIN ODYSSEUS</span>
        <p>A Siren warning sends an iMessage. Damage escalates to a FaceTime video call — hold your notebook or study notes up to the iPhone camera to repair the hull by +10 HP.</p>
      </div>
      <div className="chert-rows">
        {onCall.map((p) => (
          <div className="chert-row calling" key={p.name}>
            <Smartphone size={14} /><span><b>{p.name}</b> is on FaceTime — verifying notebook…</span>
          </div>
        ))}
        {healed && (
          <div key={healed.timestamp} className="chert-row healed">
            <ShieldCheck size={14} /><span><b>{healed.player}</b>: {healed.reason}</span>
          </div>
        )}
        {!onCall.length && !healed && <div className="chert-row idle"><span>No check-ins in progress.</span></div>}
      </div>
    </section>
  )
}
