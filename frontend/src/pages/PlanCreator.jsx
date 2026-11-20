import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlan } from '../context/PlanContext'
import DualAnatomy from '../components/ui/DualAnatomy'
import ExerciseIcon from '../components/ui/ExerciseIcon'
import styles from './PlanCreator.module.css'

const MUSCLE_BADGES = [
  { id: 'chest', label: 'Грудь' },
  { id: 'shoulders', label: 'Плечи' },
  { id: 'biceps', label: 'Бицепс' },
  { id: 'triceps', label: 'Трицепс' },
  { id: 'core', label: 'Кор' },
  { id: 'lats', label: 'Спина' },
]

function PlanCreator() {
  const navigate = useNavigate()
  const {
    planTitle,
    activeDay,
    setActiveDay,
    days,
    removeExercise,
    toggleExpandExercise,
    updateSetInExercise,
    addSetToExercise,
    removeSetFromExercise,
    addDay,
    removeDay,
    resetPlan,
  } = usePlan()

  const [newReps, setNewReps] = useState('')
  const [newWeight, setNewWeight] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [editingCardIdx, setEditingCardIdx] = useState(null)

  const currentDayData = days[activeDay] || { name: `День ${activeDay + 1}`, exercises: [] }
  const exercises = currentDayData.exercises || []

  // Active muscles automatically determined by current day's exercises
  const activeMuscleIds = Array.from(
    new Set(exercises.map((ex) => ex.muscleGroup).filter(Boolean))
  )

  // Calculate statistics
  const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0)
  const totalLoadKg = exercises.reduce((sum, ex) => {
    return sum + (ex.sets || []).reduce((setSum, s) => setSum + ((s.reps || 0) * (s.weight || 0)), 0)
  }, 0)
  const estimatedMinutes = totalSets > 0 ? Math.round(totalSets * 3.5) : 0

  const handleAddNewSet = (exIdx) => {
    const repsNum = Number(newReps) || 10
    const weightNum = Number(newWeight) || 67
    addSetToExercise(activeDay, exIdx, { reps: repsNum, weight: weightNum })
    setNewReps('')
    setNewWeight('')
  }

  const handleSave = () => {
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  const getDaysWord = (n) => {
    if (n === 1) return 'день'
    if (n >= 2 && n <= 4) return 'дня'
    return 'дней'
  }

  return (
    <div className={styles.page}>
      {/* ── Standalone Dual Anatomy Component (Front + Back) ── */}
      <DualAnatomy
        activeMuscles={activeMuscleIds}
        height={1200}
      />

      <div className={styles.container}>
        {/* ── Title & Days Header ───────────────────────────────── */}
        <div className={styles.titleRow}>
          <h1 className={styles.planTitle}>{planTitle}</h1>
          <span className={styles.daysCount}>
            {days.length} {getDaysWord(days.length)}
          </span>
        </div>

        {/* ── Stats Box ────────────────────────────────────────── */}
        <div className={styles.statsCard}>
          <div className={styles.statColumn}>
            <span className={styles.statLabel}>Подходов</span>
            <span className={styles.statValue}>{totalSets}</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statColumn}>
            <span className={styles.statLabel}>Нагрузка</span>
            <span className={styles.statValue}>{totalLoadKg} кг</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statColumn}>
            <span className={styles.statLabel}>Продолжительность</span>
            <span className={styles.statValue}>~{estimatedMinutes} мин</span>
          </div>
        </div>

        {/* ── Muscle Status Badges (non-clickable status indicators) ── */}
        <div className={styles.muscleBadgesRow}>
          {MUSCLE_BADGES.map((m) => {
            const isActive = activeMuscleIds.includes(m.id)
            return (
              <div
                key={m.id}
                className={`${styles.muscleBadge} ${isActive ? styles.muscleBadgeActive : ''}`}
                title={isActive ? `${m.label} (активна в текущем плане)` : `${m.label} (не задействована)`}
              >
                {m.label}
              </div>
            )
          })}
        </div>

        {/* ── Days Navigation Tabs ─────────────────────────────── */}
        <div className={styles.dayTabsRow}>
          {days.map((day, idx) => {
            const isActive = idx === activeDay
            return (
              <div
                key={idx}
                className={`${styles.dayTabWrapper} ${isActive ? styles.dayTabWrapperActive : ''}`}
              >
                <button
                  type="button"
                  className={`${styles.dayTab} ${isActive ? styles.dayTabActive : ''}`}
                  onClick={() => setActiveDay(idx)}
                >
                  {day.name}
                </button>
                {days.length > 1 && (
                  <button
                    type="button"
                    className={styles.removeDayBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      removeDay(idx)
                    }}
                    title={`Удалить ${day.name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
          {days.length < 7 ? (
            <button
              type="button"
              className={styles.addDayTab}
              onClick={addDay}
              title="Добавить тренировочный день"
            >
              Добавить +
            </button>
          ) : (
            <span
              className={styles.maxDaysLabel}
              title="Максимальное количество дней: 7"
            >
              Макс. (7 дней)
            </span>
          )}
        </div>

        {/* ── Exercises List ───────────────────────────────────── */}
        <div className={styles.exercisesList}>
          {exercises.map((ex, exIdx) => {
            const numStr = String(exIdx + 1).padStart(2, '0')
            const setsSummary = ex.sets?.map((s) => s.reps).join(' \\ ') || '10'
            const avgWeight = ex.sets?.[0]?.weight || 67
            const isEditing = editingCardIdx === exIdx

            return (
              <div key={ex.id || exIdx} className={styles.exerciseCard}>
                {/* Header Row */}
                <div
                  className={styles.exerciseHeader}
                  onClick={() => toggleExpandExercise(activeDay, exIdx)}
                >
                  <div className={styles.exIndexBadge}>{numStr}</div>
                  <ExerciseIcon size={34} color="#040900" className={styles.cardExerciseIcon} />
                  <div className={styles.exerciseHeaderInfo}>
                    <div className={styles.cardExerciseName}>{ex.name}</div>
                    <div className={styles.cardExerciseSubtitle}>
                      {ex.sets?.length || 4} подхода • {setsSummary} • {avgWeight} кг
                    </div>
                  </div>

                  {/* Actions: Info, Edit, Delete */}
                  <div className={styles.exerciseActions} onClick={(e) => e.stopPropagation()}>
                    {/* Кнопка информации — переход на страницу с информацией */}
                    <button
                      type="button"
                      className={styles.infoExerciseBtn}
                      onClick={() => {
                        navigate(
                          `/exercise/${ex.muscleGroup || 'chest'}/${ex.exerciseId || 'bench-press'}?view=technique&from=plan`
                        )
                      }}
                      title="Информация и техника выполнения"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                    </button>

                    {/* Кнопка редактирования */}
                    <button
                      type="button"
                      className={`${styles.editExerciseBtn} ${isEditing ? styles.editExerciseBtnActive : ''}`}
                      onClick={() => {
                        if (!ex.isExpanded && !isEditing) {
                          toggleExpandExercise(activeDay, exIdx)
                        }
                        setEditingCardIdx(isEditing ? null : exIdx)
                      }}
                      title={isEditing ? 'Завершить редактирование' : 'Редактировать подходы'}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>

                    {/* Кнопка удаления */}
                    <button
                      type="button"
                      className={styles.removeExerciseBtn}
                      onClick={() => removeExercise(activeDay, exIdx)}
                      title="Удалить упражнение"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Expanded Sets Stepper */}
                {ex.isExpanded && (
                  <div className={styles.expandedSetsContainer}>
                    <div className={styles.stepperTrack}>
                      {ex.sets.map((set, sIdx) => (
                        <div key={sIdx} className={styles.setRow}>
                          <div className={styles.nodeWrapper}>
                            <div className={styles.stepNode}>{sIdx + 1}</div>
                            {sIdx < ex.sets.length && <div className={styles.stepperLine} />}
                          </div>

                          <div className={styles.setRowContent}>
                            {isEditing ? (
                              <div className={styles.inlineEditSetGroup}>
                                <div className={styles.inlineEditField}>
                                  <input
                                    type="number"
                                    className={styles.inlineEditInput}
                                    value={set.reps}
                                    onChange={(e) =>
                                      updateSetInExercise(activeDay, exIdx, sIdx, 'reps', e.target.value)
                                    }
                                    min={1}
                                  />
                                  <span className={styles.inlineEditLabel}>повт.</span>
                                </div>
                                <div className={styles.inlineEditField}>
                                  <input
                                    type="number"
                                    className={styles.inlineEditInput}
                                    value={set.weight}
                                    onChange={(e) =>
                                      updateSetInExercise(activeDay, exIdx, sIdx, 'weight', e.target.value)
                                    }
                                    min={0}
                                  />
                                  <span className={styles.inlineEditLabel}>кг</span>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className={styles.setRepsText}>{set.reps} повт.</span>
                                <span className={styles.setWeightText}>{set.weight} кг</span>
                              </>
                            )}

                            <button
                              type="button"
                              className={styles.removeSetBtn}
                              onClick={() => removeSetFromExercise(activeDay, exIdx, sIdx)}
                              title="Удалить подход"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}

                      {/* Add new set row node */}
                      <div className={styles.setRow}>
                        <div className={styles.nodeWrapper}>
                          <div className={styles.stepNode}>{ex.sets.length + 1}</div>
                        </div>
                        <div className={styles.setRowContent}>
                          <input
                            type="number"
                            placeholder="_ повт."
                            className={styles.inlineSetInput}
                            value={newReps}
                            onChange={(e) => setNewReps(e.target.value)}
                          />
                          <input
                            type="number"
                            placeholder="_ кг"
                            className={styles.inlineSetInput}
                            value={newWeight}
                            onChange={(e) => setNewWeight(e.target.value)}
                          />
                          <button
                            type="button"
                            className={styles.addSetInlineBtn}
                            onClick={() => handleAddNewSet(exIdx)}
                            title="Добавить подход"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Bottom toolbar when in edit mode */}
                    {isEditing && (
                      <div className={styles.cardEditFooter}>
                        <button
                          type="button"
                          className={styles.finishEditBtn}
                          onClick={() => setEditingCardIdx(null)}
                        >
                          ✓ Готово
                        </button>
                        <button
                          type="button"
                          className={styles.openFullEditorBtn}
                          onClick={() => navigate(`/exercise/${ex.muscleGroup || 'chest'}/${ex.exerciseId || 'bench-press'}`)}
                        >
                          Открыть в подробном редакторе ↗
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Add Exercise Main Button ──────────────────────────── */}
        <button
          type="button"
          className={styles.addExerciseMainBtn}
          onClick={() => navigate('/muscle-picker')}
        >
          <span className={styles.plusBox}>+</span>
          <span>Добавить упражнение</span>
        </button>

        {/* ── Save Notification Toast ──────────────────────────── */}
        {saveSuccess && (
          <div className={styles.toastSuccess}>
            ✓ План успешно сохранен!
          </div>
        )}

        {/* ── Bottom Action Buttons ────────────────────────────── */}
        <div className={styles.bottomActions}>
          <button
            type="button"
            className={styles.resetPlanBtn}
            onClick={resetPlan}
          >
            СБРОСИТЬ
          </button>
          <button
            type="button"
            className={styles.savePlanBtn}
            onClick={handleSave}
          >
            СОХРАНИТЬ
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlanCreator
