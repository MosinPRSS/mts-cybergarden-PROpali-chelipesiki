import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import AnatomyPanel from '../components/ui/AnatomyPanel'
import ExerciseIcon from '../components/ui/ExerciseIcon'
import { getExercisesForMuscle } from '../data/exercises'
import styles from './ExerciseList.module.css'

function ExerciseList() {
  const { muscleGroup } = useParams()
  const navigate = useNavigate()
  const exercises = getExercisesForMuscle(muscleGroup)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const displayedList = exercises.length > 0 ? exercises : [
    { id: 'bench-press', name: 'ЖИМ ЛЕЖА' },
  ]

  return (
    <div className={styles.page}>
      {/* Left — anatomy panel */}
      <div className={styles.anatomySide}>
        <AnatomyPanel muscleGroupId={muscleGroup} />
      </div>

      {/* Right — exercise list */}
      <div className={styles.listSide}>
        <div className={styles.listWrapper}>
          <div className={styles.topGradient} />
          
          <div className={styles.itemsColumn}>
            {displayedList.map((ex, i) => {
              const isActive = selectedIndex === i
              return (
                <button
                  key={`${ex.id}-${i}`}
                  type="button"
                  className={`${styles.exerciseItem} ${isActive ? styles.exerciseItemActive : ''}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => navigate(`/exercise/${muscleGroup}/${ex.id}`)}
                >
                  <ExerciseIcon
                    size={isActive ? 50 : 38}
                    color="#040900"
                    className={styles.exerciseIcon}
                  />
                  <span className={styles.exerciseName}>{ex.name}</span>
                </button>
              )
            })}
          </div>

          <div className={styles.bottomGradient} />
        </div>
      </div>
    </div>
  )
}

export default ExerciseList
