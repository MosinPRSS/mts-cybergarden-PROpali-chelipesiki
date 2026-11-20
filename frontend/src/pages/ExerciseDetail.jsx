import { useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { usePlan } from '../context/PlanContext'
import AnatomyPanel from '../components/ui/AnatomyPanel'
import ExerciseIcon from '../components/ui/ExerciseIcon'
import { getExercise } from '../data/exercises'
import styles from './ExerciseDetail.module.css'

function ExerciseDetail() {
  const { muscleGroup, exerciseId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { addExerciseToPlan } = usePlan()
  const exercise = getExercise(muscleGroup, exerciseId)

  const initialView = searchParams.get('view') === 'technique' ? 'technique' : searchParams.get('view') === 'video' ? 'video' : 'sets'
  const isFromPlan = searchParams.get('from') === 'plan' || Boolean(searchParams.get('view'))
  const [view, setView] = useState(initialView)
  const [sets, setSets] = useState(
    () => exercise?.defaultSets?.map((s) => ({ ...s })) || [
      { reps: 10, weight: 100 },
      { reps: 10, weight: 100 },
      { reps: 12, weight: 100 },
      { reps: 12, weight: 100 },
    ]
  )
  const [isPlaying, setIsPlaying] = useState(false)

  if (!exercise) {
    return (
      <div className={styles.page}>
        <div style={{ color: '#fff', padding: '100px 40px', textAlign: 'center' }}>
          <h2>Упражнение не найдено</h2>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => navigate('/create-plan')}
          >
            ← К плану
          </button>
        </div>
      </div>
    )
  }

  const updateSet = (idx, field, val) => {
    setSets((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: Number(val) || 0 } : s))
    )
  }

  const addSet = () => {
    setSets((prev) => {
      const last = prev[prev.length - 1] || { reps: 10, weight: 100 }
      return [...prev, { ...last }]
    })
  }

  const removeSet = () => {
    if (sets.length > 1) {
      setSets((prev) => prev.slice(0, -1))
    }
  }

  const handleConfirm = () => {
    addExerciseToPlan(
      {
        id: exercise.id,
        name: exercise.name,
        muscleGroup: muscleGroup,
        defaultSets: exercise.defaultSets,
      },
      sets
    )
    navigate('/create-plan')
  }

  return (
    <div className={styles.page}>
      {/* ── Left anatomy panel ────────────────────────────── */}
      <div className={styles.anatomySide}>
        <AnatomyPanel muscleGroupId={muscleGroup} />
      </div>

      {/* ── Right content panel ───────────────────────────── */}
      <div className={styles.contentSide}>
        {/* Title row */}
        <div className={styles.titleRow}>
          <div className={styles.titleGroup}>
            <ExerciseIcon size={46} color="#e5f0dc" className={styles.titleIcon} />
            <h1 className={styles.exerciseTitle}>{exercise.name}</h1>
          </div>
          {view === 'sets' && (
            <button
              type="button"
              className={styles.questionBtn}
              onClick={() => setView('technique')}
              title="Техника выполнения"
            >
              ?
            </button>
          )}
          {view !== 'sets' && (
            <button
              type="button"
              className={styles.closeToSetsBtn}
              onClick={() => {
                if (isFromPlan) {
                  navigate(-1)
                } else {
                  setView('sets')
                }
              }}
              title={isFromPlan ? 'Назад к плану' : 'Назад к подходам'}
            >
              ✕
            </button>
          )}
          {view === 'sets' && isFromPlan && (
            <button
              type="button"
              className={styles.closeToSetsBtn}
              onClick={() => navigate(-1)}
              title="Назад к плану"
            >
              ✕
            </button>
          )}
        </div>

        {/* ── Sets View (Screenshot 1) ────────────────────── */}
        {view === 'sets' && (
          <div className={styles.setsContainer}>
            <div className={styles.setsCountHeader}>
              <span className={styles.setsCountLabel}>Подходов:</span>
              <div className={styles.setsCountUnderline}>
                <span className={styles.setsCountNumber}>{sets.length}</span>
                <div className={styles.setsCountButtons}>
                  <button type="button" className={styles.countChangeBtn} onClick={removeSet}>
                    −
                  </button>
                  <button type="button" className={styles.countChangeBtn} onClick={addSet}>
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.thSet}>Сет</th>
                    <th className={styles.thReps}>Повторения</th>
                    <th className={styles.thWeight}>Вес</th>
                  </tr>
                </thead>
                <tbody>
                  {sets.map((s, idx) => (
                    <tr key={idx} className={styles.tableRow}>
                      <td className={styles.tdSet}>{idx + 1}</td>
                      <td className={styles.tdReps}>
                        <input
                          type="number"
                          className={styles.cellInput}
                          value={s.reps}
                          onChange={(e) => updateSet(idx, 'reps', e.target.value)}
                        />
                      </td>
                      <td className={styles.tdWeight}>
                        <div className={styles.weightCellGroup}>
                          <input
                            type="number"
                            className={styles.cellInput}
                            value={s.weight}
                            onChange={(e) => updateSet(idx, 'weight', e.target.value)}
                          />
                          <span className={styles.kgLabel}>КГ</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              className={styles.confirmBtn}
              onClick={handleConfirm}
            >
              ПОДТВЕРДИТЬ
            </button>
          </div>
        )}

        {/* ── Technique View (Screenshot 2) ───────────────── */}
        {view === 'technique' && (
          <div className={styles.techniqueContainer}>
            <div className={styles.stepsList}>
              {exercise.technique.map((step, sIdx) => (
                <div key={sIdx} className={styles.techniqueStep}>
                  <div className={styles.stepNumCol}>
                    <div className={styles.stepCircle}>{sIdx + 1}</div>
                    {sIdx < exercise.technique.length - 1 && (
                      <div className={styles.stepDashedLine} />
                    )}
                  </div>
                  <div className={styles.stepContent}>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepDescription}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Vertical SHOW VIDEO Tab on right edge */}
            <button
              type="button"
              className={styles.showVideoTab}
              onClick={() => setView('video')}
            >
              <span className={styles.tabArrow}>▲</span>
              <span className={styles.tabText}>СМОТРЕТЬ ВИДЕО</span>
              <span className={styles.tabArrow}>▼</span>
            </button>
          </div>
        )}

        {/* ── Video View (Screenshot 4) ──────────────────── */}
        {view === 'video' && (
          <div className={styles.videoContainer}>
            <div
              className={styles.videoFrame}
              onClick={() => setIsPlaying(!isPlaying)}
            >
              <div className={styles.videoTimer}>02:22</div>
              {!isPlaying ? (
                <div className={styles.playOverlay}>
                  <div className={styles.playTriangle} />
                </div>
              ) : (
                <div className={styles.videoSimPlaying}>
                  <div className={styles.pulsingWave} />
                  <span>Воспроизведение видео...</span>
                </div>
              )}
            </div>

            <button
              type="button"
              className={styles.toggleTextDescBtn}
              onClick={() => setView('technique')}
            >
              ▼ Описание техники ▼
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default ExerciseDetail
