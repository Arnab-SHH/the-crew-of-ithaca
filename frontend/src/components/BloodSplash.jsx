import React from 'react'

// A short blood splash over the screen each time the hull takes damage.
// Keyed by the damage timestamp, so every hit plays it again. Fades out by itself.

// Small seeded random, so one hit always draws the same splatter
function random(seed) {
  let s = seed % 2147483647 || 1
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

// One splatter: a big blob, a ring of bumps and a few flying drops
function Splatter({ x, y, size, seed }) {
  const r = random(seed)
  const bumps = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + r()
    const d = 28 + r() * 14
    return <circle key={`b${i}`} cx={50 + Math.cos(a) * d} cy={50 + Math.sin(a) * d} r={8 + r() * 9} />
  })
  const drops = Array.from({ length: 7 }, (_, i) => {
    const a = r() * Math.PI * 2
    const d = 52 + r() * 40
    return <circle key={`d${i}`} cx={50 + Math.cos(a) * d} cy={50 + Math.sin(a) * d} r={2 + r() * 4} />
  })
  return (
    <svg className="blood-splat" viewBox="-50 -50 200 200"
      style={{ left: `${x}%`, top: `${y}%`, width: size, height: size, transform: `translate(-50%,-50%) rotate(${r() * 360}deg)` }}>
      <circle cx="50" cy="50" r="34" />
      {bumps}
      {drops}
    </svg>
  )
}

export default function BloodSplash({ lastEvent }) {
  if (lastEvent?.type !== 'damage') return null
  const seed = Math.floor(lastEvent.timestamp) || 1
  const r = random(seed)
  // Near the edges of the screen, so the game stays readable
  const spots = [
    [8 + r() * 10, 12 + r() * 20], [88 + r() * 8, 18 + r() * 25],
    [6 + r() * 12, 72 + r() * 18], [86 + r() * 10, 75 + r() * 15],
  ]
  return (
    <div className="blood-splash" key={lastEvent.timestamp} aria-hidden="true">
      {spots.map(([x, y], i) => (
        <Splatter key={i} x={x} y={y} size={150 + r() * 120} seed={seed + i * 7919} />
      ))}
    </div>
  )
}
