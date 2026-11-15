import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Camera } from 'lucide-react'
import { socket } from '../services/socket.js'

const FALLBACK_AFTER_MS = 10000 // give the Python sensor time to boot before using the browser camera
const STALE_MS = 3000

// Collapsible picture-in-picture of the ML sensor's annotated webcam stream.
export default function MiniWebcamPIP({ player, sensorOnline, sensorHint, open, onToggle }) {
  const [frame, setFrame] = useState(null) // { image, state, reason, at }
  const [local, setLocal] = useState(false)
  const [note, setNote] = useState('Waiting for the focus sensor…')
  const [, tick] = useState(0)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    const onFrame = (d) => { if (d.player === player) setFrame({ ...d, at: Date.now() }) }
    socket.on('webcam_frame', onFrame)
    const t = setInterval(() => tick((n) => n + 1), 1000) // re-check staleness
    return () => { socket.off('webcam_frame', onFrame); clearInterval(t) }
  }, [player])

  const live = frame && Date.now() - frame.at < STALE_MS

  function stopLocal() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setLocal(false)
  }

  async function startLocal() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setNote('Browser camera needs localhost or https')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      setLocal(true)
    } catch {
      setNote('Camera unavailable — it may be in use by the sensor')
    }
  }

  // Fallback: no frames and no sensor after a while -> show the browser camera
  useEffect(() => {
    if (live || sensorOnline || local) return
    const t = setTimeout(startLocal, FALLBACK_AFTER_MS)
    return () => clearTimeout(t)
  }, [live, sensorOnline, local])

  // Sensor stream arrived -> release the browser camera so Python can keep it
  useEffect(() => { if (live && local) stopLocal() }, [live, local])
  useEffect(() => () => stopLocal(), [])
  useEffect(() => { if (local && videoRef.current) videoRef.current.srcObject = streamRef.current }, [local, open])

  const focused = live && frame.state === 'focused'
  const label = live ? (focused ? 'FOCUSED' : 'DISTRACTED') : local ? 'BROWSER CAM' : sensorOnline ? 'STARTING' : 'OFFLINE'

  return (
    <div className={`pip ${open ? '' : 'collapsed'}`}>
      <button type="button" className="pip-head" onClick={onToggle}>
        <span className={`status ${live ? (focused ? 'focused' : 'distracted') : 'warning'}`} />
        <span>LIVE SENSOR · {label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      {open && (
        <div className="pip-body">
          {live ? (
            <img src={`data:image/jpeg;base64,${frame.image}`} alt="Your focus sensor camera" />
          ) : local ? (
            <video ref={videoRef} autoPlay muted playsInline className="mirror" />
          ) : (
            <div className="pip-empty">
              <Camera size={18} />
              <span>{note}</span>
              {sensorHint && !sensorOnline && (
                <>
                  <span>Start it on the computer with your webcam (from ml-sensor-node/):</span>
                  <code className="pip-cmd">{sensorHint}</code>
                </>
              )}
              <button type="button" className="secondary" onClick={startLocal}>Use browser camera</button>
            </div>
          )}
          {live && <div className={`pip-reason ${focused ? '' : 'bad'}`}>{frame.reason}</div>}
        </div>
      )}
    </div>
  )
}
