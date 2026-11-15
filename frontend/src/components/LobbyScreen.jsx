import React, { useState } from 'react'
import { Shield, Compass, BookOpen } from 'lucide-react'

const PHONE_RE = /^\+?[1-9]\d{9,14}$/
const cleanPhone = (p) => p.replace(/[\s().-]/g, '')
const randomCode = () => `ITHACA_${Math.floor(100 + Math.random() * 900)}`

export default function LobbyScreen({ onJoin, error, joining }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('ITHACA_1')
  const [phone, setPhone] = useState('')
  const [localError, setLocalError] = useState('')

  function enter(create) {
    setLocalError('')
    const room = create ? randomCode() : code.trim().toUpperCase()
    if (create) setCode(room)
    if (!name.trim()) return setLocalError('Choose a crew name first.')
    if (!room) return setLocalError('Enter a crew code.')
    if (!PHONE_RE.test(cleanPhone(phone))) return setLocalError('Enter your phone with country code, e.g. +1 817 555 0199.')
    onJoin({ room, player: name.trim(), phone: cleanPhone(phone) })
  }

  const shown = localError || error

  return (
    <section className="lobby">
      <div className="eyebrow">✦ &nbsp; A STUDY VOYAGE FOR THE CREW ✦</div>
      <h1>Hold fast.<br /><i>Reach Ithaca.</i></h1>
      <p className="intro">Set sail with your crew. Keep your focus through the Sirens and bring the ship home together.</p>
      <form className="panel form" onSubmit={(e) => { e.preventDefault(); enter(false) }}>
        <label>PLAYER NAME<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Odysseus" maxLength={24} /></label>
        <label>ROOM CODE<input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter a crew code" maxLength={12} /></label>
        <label>PHONE NUMBER<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 817 555 0199" inputMode="tel" maxLength={20} /></label>
        <div className="row">
          <button type="submit" className="primary" disabled={joining}>{joining ? 'Boarding…' : 'Join voyage'} <Compass size={16} /></button>
          <button type="button" className="secondary" disabled={joining} onClick={() => enter(true)}>Create room</button>
        </div>
        {shown && <p className="error join-error">{shown}</p>}
        <small className="privacy">Your number is only used for Chert iMessage / FaceTime check-ins from Captain Odysseus · Camera frames stay on your crew's computer</small>
      </form>
      <div className="lobby-foot">
        <span><Shield size={14} /> ONE CREW, ONE HULL</span>
        <span><BookOpen size={14} /> 25 MINUTES TO ITHACA</span>
      </div>
    </section>
  )
}
