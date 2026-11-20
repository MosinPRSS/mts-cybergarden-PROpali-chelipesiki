import anatomyFront from '../../assets/AnatomyFront.png'
import anatomyBack from '../../assets/AnatomyBack.png'
import { MUSCLE_GROUPS } from '../../data/muscles'
import styles from './DualAnatomy.module.css'

/**
 * DualAnatomy
 * Displays Front and Back anatomical models side-by-side with automatic
 * overlay highlights for active muscle groups.
 *
 * Props:
 *   - activeMuscles: string[] - array of muscle IDs to highlight (e.g. ['chest', 'lats'])
 *   - height: number | string - height of the anatomy figures (default 1200px)
 *   - className: string - extra CSS classes for container
 */
function DualAnatomy({
  activeMuscles = ['chest', 'lats'],
  height = 1200,
  className = '',
}) {
  const heightStyle = typeof height === 'number' ? `${height}px` : height

  const frontMuscles = MUSCLE_GROUPS.filter(
    (m) => m.view === 'front' && m.overlay && activeMuscles.includes(m.id)
  )

  const backMuscles = MUSCLE_GROUPS.filter(
    (m) => m.view === 'back' && m.overlay && activeMuscles.includes(m.id)
  )

  return (
    <div
      className={`${styles.container} ${className}`}
      style={{ '--dual-anatomy-height': heightStyle }}
    >
      {/* Front View Figure */}
      <div className={styles.figureWrapper}>
        <img
          src={anatomyFront}
          alt="Анатомическая модель (вид спереди)"
          className={styles.anatomyImg}
        />
        {frontMuscles.map((muscle) => (
          <img
            key={muscle.id}
            src={muscle.overlay}
            alt={muscle.label}
            className={styles.overlay}
            style={muscle.overlayStyle}
          />
        ))}
      </div>

      {/* Back View Figure */}
      <div className={styles.figureWrapper}>
        <img
          src={anatomyBack}
          alt="Анатомическая модель (вид сзади)"
          className={styles.anatomyImg}
        />
        {backMuscles.map((muscle) => (
          <img
            key={muscle.id}
            src={muscle.overlay}
            alt={muscle.label}
            className={styles.overlay}
            style={muscle.overlayStyle}
          />
        ))}
      </div>
    </div>
  )
}

export default DualAnatomy
