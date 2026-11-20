import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import anatomyFront from '../assets/AnatomyFront.png'
import anatomyBack from '../assets/AnatomyBack.png'
import chestOverlay from '../assets/ChestPicked.svg'
import latsOverlay from '../assets/LatsPicked.svg'
import styles from './MusclePicker.module.css'

/**
 * MUSCLE_GROUPS template — add more entries here to support new muscle groups.
 *
 * How to position overlays:
 *   1. Enable DEV_MODE below to see crosshairs & coordinates on hover
 *   2. Hover over the anatomy image to find the target muscle's top-left corner
 *   3. The overlay width = SVG native width / image native width × 100
 *
 *   Front image: 1265 × 2447
 *   Back image:  1097 × 2447
 *   ChestPicked.svg: 407 × 226  →  width on front = 407/1265 = 32.2%
 *   LatsPicked.svg:  381 × 435  →  width on back  = 381/1097 = 34.7%
 */
const DEV_MODE = true // Set true to show coordinate helper

const MUSCLE_GROUPS = [
  {
    id: 'chest',
    label: 'ГРУДЬ',
    view: 'front',
    overlay: chestOverlay,
    // ChestPicked.svg 407×226 on front 1265×2447
    // Pectorals sit below the collarbone, centered on the torso
    overlayStyle: {
      top: '21%',
      left: '30.5%',
      width: '32.2%',
    },
    labelStyle: {
      top: '22%',
      left: '64%',
    },
  },
  {
    id: 'lats',
    label: 'СПИНА',
    view: 'back',
    overlay: latsOverlay,
    // LatsPicked.svg 381×435 on back 1097×2447
    // Lats span from upper back (armpit level) down to lower back
    overlayStyle: {
      top: '28%',
      left: '30%',
      width: '36%',
    },
    labelStyle: {
      top: '25%',
      left: '68%',
    },
  },
]

function MusclePicker({ onSelect }) {
  const [view, setView] = useState('front')
  const [hovered, setHovered] = useState(null)
  const [devCoords, setDevCoords] = useState(null)
  const wrapperRef = useRef(null)
  const navigate = useNavigate()

  const visibleMuscles = MUSCLE_GROUPS.filter((m) => m.view === view)

  const handleDevMove = (e) => {
    if (!DEV_MODE || !wrapperRef.current) return
    const rect = wrapperRef.current.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width * 100).toFixed(1)
    const yPct = ((e.clientY - rect.top) / rect.height * 100).toFixed(1)
    setDevCoords({ x: xPct, y: yPct, px: e.clientX - rect.left, py: e.clientY - rect.top })
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>ВЫБЕРИТЕ ГРУППУ МЫШЦ</h1>

      <div
        className={styles.bodyWrapper}
        ref={wrapperRef}
        onMouseMove={handleDevMove}
      >
        {/* Anatomy base image */}
        <img
          src={view === 'front' ? anatomyFront : anatomyBack}
          alt={`Anatomy ${view} view`}
          className={styles.anatomy}
        />

        {/* SVG muscle overlays */}
        {visibleMuscles.map((muscle) => (
          <button
            key={muscle.id}
            className={styles.overlayBtn}
            style={muscle.overlayStyle}
            onMouseEnter={() => setHovered(muscle.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              onSelect?.(muscle)
              navigate(`/exercises/${muscle.id}`)
            }}
            aria-label={muscle.label}
          >
            <img
              src={muscle.overlay}
              alt=""
              className={`${styles.overlayImg} ${hovered === muscle.id ? styles.overlayImgHover : ''}`}
            />
          </button>
        ))}

        {/* Hover label badges */}
        {visibleMuscles.map(
          (muscle) =>
            hovered === muscle.id && (
              <span
                key={`label-${muscle.id}`}
                className={styles.muscleBadge}
                style={muscle.labelStyle}
              >
                {muscle.label}
              </span>
            ),
        )}

        {/* DEV MODE: coordinate crosshair */}
        {DEV_MODE && devCoords && (
          <div
            style={{
              position: 'fixed',
              top: 10,
              right: 10,
              background: 'rgba(0,0,0,0.85)',
              color: '#7fff00',
              padding: '8px 12px',
              fontFamily: 'monospace',
              fontSize: 14,
              zIndex: 999,
              borderRadius: 4,
            }}
          >
            top: {devCoords.y}% | left: {devCoords.x}%
          </div>
        )}
      </div>

      {/* Rotation arrows — fixed to viewport sides */}
      <button
        className={`${styles.rotateBtn} ${styles.rotateBtnLeft}`}
        onClick={() => setView((v) => (v === 'front' ? 'back' : 'front'))}
        aria-label="Rotate left"
      >
        <RotateIcon />
      </button>
      <button
        className={`${styles.rotateBtn} ${styles.rotateBtnRight}`}
        onClick={() => setView((v) => (v === 'front' ? 'back' : 'front'))}
        aria-label="Rotate right"
      >
        <RotateIcon mirrored />
      </button>
    </div>
  )
}

function RotateIcon({ mirrored }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle cx="20" cy="20" r="16" fill="rgba(220,255,200,0.07)" />
      <path
        d="M8 20C8 13.373 13.373 8 20 8c4.3 0 8.1 2.1 10.4 5.3"
        stroke="#d4f5b0"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#glow)"
      />
      <polyline
        points="26,5 30.4,13.3 22,14"
        fill="none"
        stroke="#d4f5b0"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#glow)"
      />
      <path
        d="M32 20C32 26.627 26.627 32 20 32c-4.3 0-8.1-2.1-10.4-5.3"
        stroke="#d4f5b0"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#glow)"
      />
    </svg>
  )
}

export default MusclePicker
