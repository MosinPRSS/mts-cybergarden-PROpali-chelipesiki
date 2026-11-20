import { getMuscleGroup } from '../../data/muscles'
import anatomyFront from '../../assets/AnatomyFront.png'
import anatomyBack from '../../assets/AnatomyBack.png'
import styles from './AnatomyPanel.module.css'

function AnatomyPanel({ muscleGroupId, className = '', compact = false }) {
  const muscle = getMuscleGroup(muscleGroupId)
  const view = muscle?.view || 'front'
  const imgSrc = view === 'front' ? anatomyFront : anatomyBack

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ''} ${className}`}>
      <div className={styles.imageWrapper}>
        <img
          src={imgSrc}
          alt={`Anatomy ${view}`}
          className={styles.anatomyImg}
        />
        {muscle?.overlay && (
          <img
            src={muscle.overlay}
            alt=""
            className={styles.overlay}
            style={muscle.overlayStyle}
          />
        )}
      </div>
    </div>
  )
}

export default AnatomyPanel
