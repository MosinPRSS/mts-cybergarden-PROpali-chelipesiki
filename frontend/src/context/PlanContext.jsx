/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react'

const PlanContext = createContext(null)

export function PlanProvider({ children }) {
  const [planTitle, setPlanTitle] = useState('Мой тренировочный план')
  const [activeDay, setActiveDay] = useState(0)
  const [days, setDays] = useState([
    { name: 'День 1', exercises: [] },
  ])
  const [activeMuscles, setActiveMuscles] = useState([])

  const addExerciseToPlan = (exercise, customSets) => {
    const newExercise = {
      id: `${exercise.id}-${Date.now()}`,
      exerciseId: exercise.id,
      muscleGroup: exercise.muscleGroup || 'chest',
      name: exercise.name,
      isExpanded: false,
      sets: customSets && customSets.length > 0 ? customSets : exercise.defaultSets || [{ reps: 10, weight: 50 }],
    }

    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === activeDay) {
          return {
            ...day,
            exercises: [...day.exercises, newExercise],
          }
        }
        return day
      })
    )
  }

  const removeExercise = (dayIdx, exIdx) => {
    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === dayIdx) {
          return {
            ...day,
            exercises: day.exercises.filter((_, i) => i !== exIdx),
          }
        }
        return day
      })
    )
  }

  const toggleExpandExercise = (dayIdx, exIdx) => {
    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === dayIdx) {
          return {
            ...day,
            exercises: day.exercises.map((ex, i) =>
              i === exIdx ? { ...ex, isExpanded: !ex.isExpanded } : ex
            ),
          }
        }
        return day
      })
    )
  }

  const updateSetInExercise = (dayIdx, exIdx, setIdx, field, value) => {
    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === dayIdx) {
          return {
            ...day,
            exercises: day.exercises.map((ex, i) => {
              if (i === exIdx) {
                return {
                  ...ex,
                  sets: ex.sets.map((s, sI) =>
                    sI === setIdx ? { ...s, [field]: Number(value) || 0 } : s
                  ),
                }
              }
              return ex
            }),
          }
        }
        return day
      })
    )
  }

  const addSetToExercise = (dayIdx, exIdx, newSet) => {
    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === dayIdx) {
          return {
            ...day,
            exercises: day.exercises.map((ex, i) => {
              if (i === exIdx) {
                const lastSet = ex.sets[ex.sets.length - 1] || { reps: 10, weight: 50 }
                return {
                  ...ex,
                  sets: [...ex.sets, newSet || { ...lastSet }],
                }
              }
              return ex
            }),
          }
        }
        return day
      })
    )
  }

  const removeSetFromExercise = (dayIdx, exIdx, setIdx) => {
    setDays((prev) =>
      prev.map((day, idx) => {
        if (idx === dayIdx) {
          return {
            ...day,
            exercises: day.exercises.map((ex, i) => {
              if (i === exIdx && ex.sets.length > 1) {
                return {
                  ...ex,
                  sets: ex.sets.filter((_, sI) => sI !== setIdx),
                }
              }
              return ex
            }),
          }
        }
        return day
      })
    )
  }

  const addDay = () => {
    setDays((prev) => {
      if (prev.length >= 7) return prev
      return [...prev, { name: `День ${prev.length + 1}`, exercises: [] }]
    })
  }

  const removeDay = (dayIdx) => {
    setDays((prev) => {
      if (prev.length <= 1) return prev
      const updated = prev.filter((_, idx) => idx !== dayIdx)
      return updated.map((d, i) => ({
        ...d,
        name: `День ${i + 1}`,
      }))
    })
    setActiveDay((prevActive) => {
      if (prevActive === dayIdx) {
        return Math.max(0, dayIdx - 1)
      }
      if (prevActive > dayIdx) {
        return prevActive - 1
      }
      return prevActive
    })
  }

  const resetPlan = () => {
    setDays([
      { name: 'День 1', exercises: [] },
    ])
    setActiveDay(0)
    setActiveMuscles([])
  }

  return (
    <PlanContext.Provider
      value={{
        planTitle,
        setPlanTitle,
        activeDay,
        setActiveDay,
        days,
        activeMuscles,
        setActiveMuscles,
        addExerciseToPlan,
        removeExercise,
        toggleExpandExercise,
        updateSetInExercise,
        addSetToExercise,
        removeSetFromExercise,
        addDay,
        removeDay,
        resetPlan,
      }}
    >
      {children}
    </PlanContext.Provider>
  )
}

export function usePlan() {
  const context = useContext(PlanContext)
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider')
  }
  return context
}
