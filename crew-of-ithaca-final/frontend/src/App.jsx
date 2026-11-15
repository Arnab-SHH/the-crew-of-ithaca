import React, { useEffect, useRef, useState } from 'react'
import { socket, BACKEND_URL } from './services/socket.js'
import {
  playJoinSound, playWarningSound, playDamageSound, playRecoverySound, playGameOverSound,
  playCaptainVoice, playVoiceClip,
} from './services/soundEffects.js'
import TopBar from './components/TopBar.jsx'
import LobbyScreen from './components/LobbyScreen.jsx'
import VoyageHero from './components/VoyageHero.jsx'
import StatsBar from './components/StatsBar.jsx'
import ShipPanel from './components/ShipPanel.jsx'
import CrewPanel from './components/CrewPanel.jsx'
import HelmControls from './components/HelmControls.jsx'
import ChertStatusPanel from './components/ChertStatusPanel.jsx'
import DemoControlBar from './components/DemoControlBar.jsx'
import MiniWebcamPIP from './components/MiniWebcamPIP.jsx'

const VOYAGE_MS = 25 * 60 * 1000

// Play a cue for each status change between two room states
function playDeltas(prev, next) {
  for (const [name, p] of Object.entries(next.players || {})) {
    const before = prev.players?.[name]
    if (!before) continue
    if (before.status !== 'warning' && p.status === 'warning') playWarningSound()
    if (before.status !== 'damaged' && p.status === 'damaged') playDamageSound()
    if (before.status !== 'focused' && p.status === 'focused') playRecoverySound()
  }
  if (!prev.isSunk && next.isSunk) playGameOverSound()
}

export default function App() {
  const [session, setSession] = useState(null) // { room, player, phone, sensor }
  const [room, setRoom] = useState(null)       // room_state_update payload
  const [error, setError] = useState('')
  const [sensorHint, setSensorHint] = useState('')
  const [joining, setJoining] = useState(false)
  const [voice, setVoice] = useState(true)
  const [pipOpen, setPipOpen] = useState(true)
  const [hail, setHail] = useState('')
  const [voyage, setVoyage] = useState({ started: false, endsAt: null })
  const [remain, setRemain] = useState(VOYAGE_MS)

  const sessionRef = useRef(null)
  const roomRef = useRef(null)
  const voiceRef = useRef(true)
  sessionRef.current = session
  roomRef.current = room
  voiceRef.current = voice

  // Socket listeners live for the whole app
  useEffect(() => {
    const onJoinSuccess = ({ room: code, player, roomState, sensor }) => {
      setJoining(false)
      setError('')
      setSession((s) => ({ ...(s || {}), room: code, player, sensor: sensor || s?.sensor }))
      setRoom(roomState)
      if (sensor === 'remote' || sensor === 'off') {
        const phone = sessionRef.current?.phone || ''
        setSensorHint(`python src/main.py --player "${player}" --room ${code} --phone ${phone} --server ${BACKEND_URL} --headless`)
      }
    }
    const onJoinError = ({ message }) => {
      setJoining(false)
      if (!sessionRef.current?.player || !roomRef.current) setSession(null)
      setError(message)
    }
    const onRoomState = (next) => {
      if (voiceRef.current && roomRef.current) playDeltas(roomRef.current, next)
      setRoom(next)
    }
    const onCaptain = (msg) => { if (voiceRef.current) playCaptainVoice(msg) }
    const onCrewVoice = ({ player, audioData }) => {
      if (!voiceRef.current) return
      playVoiceClip(audioData)
      setHail(`📣 ${player} hails the crew`)
      setTimeout(() => setHail(''), 3000)
    }
    // After a backend restart, re-board automatically
    const onConnect = () => {
      const s = sessionRef.current
      if (s && roomRef.current) socket.emit('join_room', { room: s.room, player: s.player, phone: s.phone, source: 'web' })
    }

    socket.on('join_success', onJoinSuccess)
    socket.on('join_error', onJoinError)
    socket.on('room_state_update', onRoomState)
    socket.on('captain_voice', onCaptain)
    socket.on('crew_voice_message', onCrewVoice)
    socket.on('connect', onConnect)
    return () => {
      socket.off('join_success', onJoinSuccess)
      socket.off('join_error', onJoinError)
      socket.off('room_state_update', onRoomState)
      socket.off('captain_voice', onCaptain)
      socket.off('crew_voice_message', onCrewVoice)
      socket.off('connect', onConnect)
    }
  }, [])

  // Local voyage timer (her 25-minute Pomodoro)
  useEffect(() => {
    if (!voyage.started || !voyage.endsAt) return
    const t = setInterval(() => setRemain(voyage.endsAt - Date.now()), 500)
    return () => clearInterval(t)
  }, [voyage])

  function join({ room: code, player, phone }) {
    if (!socket.connected) {
      setError(`Can't reach the ship's backend at ${BACKEND_URL}. Is it running?`)
      return
    }
    setError('')
    setJoining(true)
    setSession({ room: code, player, phone })
    playJoinSound()
    socket.emit('join_room', { room: code, player, phone, source: 'web' })
  }

  function exit() {
    if (session) socket.emit('leave_room', { room: session.room, player: session.player })
    setSession(null)
    setRoom(null)
    setSensorHint('')
    setVoyage({ started: false, endsAt: null })
    setRemain(VOYAGE_MS)
  }

  function toggleVoyage() {
    if (voyage.started) {
      setVoyage({ started: false, endsAt: null })
      return
    }
    const endsAt = Date.now() + (remain > 0 ? remain : VOYAGE_MS)
    setVoyage({ started: true, endsAt })
  }

  const inGame = session && room
  const players = room?.players || {}
  const alert = Object.values(players).find((p) => p.status === 'damaged')
    || Object.values(players).find((p) => p.status === 'warning')
  const me = session && players[session.player]

  return (
    <main className={inGame ? 'app in-game' : 'app'}>
      <TopBar name={session?.player} active={Boolean(inGame)} />
      {!inGame ? (
        <LobbyScreen onJoin={join} error={error} joining={joining} />
      ) : (
        <>
          <VoyageHero roomCode={room.roomCode} started={voyage.started} crewCount={Object.keys(players).length} />
          <StatsBar
            hull={room.hullHealth}
            maxHealth={room.maxHealth}
            crewCount={Object.keys(players).length}
            started={voyage.started}
            remain={remain}
            lastEvent={room.lastEvent}
          />
          <section className="content">
            <ShipPanel
              alert={alert}
              started={voyage.started}
              isSunk={room.isSunk}
              onReset={() => socket.emit('reset_voyage', { room: session.room })}
            />
            <CrewPanel players={players} me={session.player} alert={alert} isSunk={room.isSunk} />
          </section>
          <HelmControls
            room={session.room}
            player={session.player}
            started={voyage.started}
            onToggleVoyage={toggleVoyage}
            pipOpen={pipOpen}
            onTogglePip={() => setPipOpen(!pipOpen)}
            voice={voice}
            onToggleVoice={() => setVoice(!voice)}
            onExit={exit}
          />
          <ChertStatusPanel players={players} lastEvent={room.lastEvent} />
          <footer>
            <span>THE CREW OF ITHACA</span>
            <span>YOUR FRAMES NEVER LEAVE YOUR CREW'S COMPUTER</span>
            <button onClick={exit}>Leave room</button>
          </footer>

          <MiniWebcamPIP
            player={session.player}
            sensorOnline={Boolean(me?.sensorOnline)}
            sensorHint={sensorHint}
            open={pipOpen}
            onToggle={() => setPipOpen(!pipOpen)}
          />
          <DemoControlBar room={session.room} player={session.player} phone={session.phone} />
          {hail && <div className="hail-toast">{hail}</div>}
        </>
      )}
    </main>
  )
}
