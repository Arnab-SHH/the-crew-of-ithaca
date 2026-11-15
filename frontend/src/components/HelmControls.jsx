import React from 'react'
import { Eye, EyeOff, Volume2, VolumeX, LogOut } from 'lucide-react'
import VoiceHailButton from './VoiceHailButton.jsx'

export default function HelmControls({ room, player, started, onToggleVoyage, pipOpen, onTogglePip, voice, onToggleVoice, onExit }) {
  return (
    <section className="controls">
      <div className="control-copy">
        <span className="eyebrow">03 &nbsp; THE HELM</span>
        <strong>Your focus is your crew's strength.</strong>
        <small>The focus sensor watches your webcam on this computer. Only your focus state is shared with the crew.</small>
      </div>
      <div className="buttons">
        <button className="primary" onClick={onToggleVoyage}>{started ? 'Pause voyage' : 'Begin voyage'}</button>
        <VoiceHailButton room={room} player={player} />
        <button className={pipOpen ? 'toggle active' : 'toggle'} onClick={onTogglePip}>
          {pipOpen ? <Eye size={15} /> : <EyeOff size={15} />} {pipOpen ? 'Camera shown' : 'Show camera'}
        </button>
        <button className="icon-button" title="Toggle voice alerts" onClick={onToggleVoice}>
          {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}{voice ? 'ON' : 'OFF'}
        </button>
        <button className="secondary abandon" onClick={onExit}><LogOut size={15} /> Abandon ship</button>
      </div>
    </section>
  )
}
