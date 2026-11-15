import React from 'react'

export default function VoyageHero({ roomCode, started, crewCount }) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow">THE AEGEAN SEA &nbsp; / &nbsp; VOYAGE {started ? 'IN PROGRESS' : 'READY'}</div>
        <h1>The sea is <i>listening.</i></h1>
        <p>Stay at the helm. Your crew sails as one.</p>
      </div>
      <div className="room-chip">
        <small>CREW ROOM</small>
        <strong>{roomCode}</strong>
        <span>{crewCount} aboard</span>
      </div>
    </section>
  )
}
