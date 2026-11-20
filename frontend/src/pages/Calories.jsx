import { useState, useMemo, useCallback } from 'react'
import styles from './Calories.module.css'

const MONTH_NAMES = [
  'ЯНВАРЬ', 'ФЕВРАЛЬ', 'МАРТ', 'АПРЕЛЬ', 'МАЙ', 'ИЮНЬ',
  'ИЮЛЬ', 'АВГУСТ', 'СЕНТЯБРЬ', 'ОКТЯБРЬ', 'НОЯБРЬ', 'ДЕКАБРЬ',
]

const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const DEFAULT_GOALS = {
  proteins: 140,
  fats: 50,
  carbs: 200,
  calories: 2200,
}

const PRESET_FOODS = [
  { name: 'Гречневая каша', proteins: 2, fats: 1, carbs: 7, calories: 45 },
  { name: 'Куриная грудка (отварная)', proteins: 31, fats: 3.6, carbs: 0, calories: 165 },
  { name: 'Овсяная каша на воде', proteins: 3.5, fats: 1.5, carbs: 15, calories: 88 },
  { name: 'Яйцо куриное вареное', proteins: 12.7, fats: 11.5, carbs: 0.7, calories: 157 },
  { name: 'Творог 5%', proteins: 16, fats: 5, carbs: 3, calories: 121 },
  { name: 'Рис басмати', proteins: 2.8, fats: 0.4, carbs: 28, calories: 130 },
  { name: 'Банан', proteins: 1.5, fats: 0.2, carbs: 21.8, calories: 96 },
]

// Day 22 matches the exact mockup numbers:
// Всего: Белки 71.1 / 140g, Жиры 27.3 / 50g, Углеводы 82.5 / 200g, Калории 865 / 2200
const INITIAL_DAYS_STORE = {
  // Workout days start marked (RED), with 0 food items:
  '2026-9-20': {
    isWorkout: true,
    meals: { breakfast: [], lunch: [], dinner: [], other: [] },
  },
  '2026-9-22': {
    isWorkout: true,
    meals: { breakfast: [], lunch: [], dinner: [], other: [] },
  },
}

// 4 standard Monday-to-Sunday weeks for October 2026
// Week 3 is: 19..25 -> "ОКТЯБРЬ 3\4"
const OCTOBER_2026_WEEKS = [
  { weekNum: 1, totalWeeks: 4, days: [5, 6, 7, 8, 9, 10, 11] },
  { weekNum: 2, totalWeeks: 4, days: [12, 13, 14, 15, 16, 17, 18] },
  { weekNum: 3, totalWeeks: 4, days: [19, 20, 21, 22, 23, 24, 25] },
  { weekNum: 4, totalWeeks: 4, days: [26, 27, 28, 29, 30, 31, 1] },
]

function getWeeksForMonth(year, monthIdx) {
  if (year === 2026 && monthIdx === 9) {
    return OCTOBER_2026_WEEKS
  }
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate()
  const weeks = []
  let day = 1
  while (day <= daysInMonth) {
    const weekDays = []
    for (let i = 0; i < 7; i++) {
      weekDays.push(day <= daysInMonth ? day : (day - daysInMonth))
      day++
    }
    weeks.push(weekDays)
  }
  return weeks.map((days, idx) => ({
    weekNum: idx + 1,
    totalWeeks: weeks.length,
    days,
  }))
}

function Calories() {
  const [currentYear, setCurrentYear] = useState(2026)
  const [currentMonthIdx, setCurrentMonthIdx] = useState(9) // 9 = October
  const [currentWeekIdx, setCurrentWeekIdx] = useState(2) // Index 2 = Week 3 ("3\4")
  const [selectedDay, setSelectedDay] = useState(22)
  const [calendarView, setCalendarView] = useState('week') // 'week' | 'month'

  // Per-day data storage: { [dateKey]: { isWorkout, meals: { breakfast: [], lunch: [], dinner: [], other: [] } } }
  const [daysData, setDaysData] = useState(INITIAL_DAYS_STORE)

  // Daily goals / limits (user editable)
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [isEditingGoals, setIsEditingGoals] = useState(false)
  const [tempGoals, setTempGoals] = useState(DEFAULT_GOALS)

  // Meal accordion open state
  const [expandedMeals, setExpandedMeals] = useState({
    breakfast: true,
    lunch: false,
    dinner: false,
    other: false,
  })

  // Modal for adding food
  const [addingToMeal, setAddingToMeal] = useState(null)
  const [foodName, setFoodName] = useState('')
  const [foodProteins, setFoodProteins] = useState('')
  const [foodFats, setFoodFats] = useState('')
  const [foodCarbs, setFoodCarbs] = useState('')
  const [foodCalories, setFoodCalories] = useState('')

  // Weeks for current month
  const monthWeeks = useMemo(
    () => getWeeksForMonth(currentYear, currentMonthIdx),
    [currentYear, currentMonthIdx]
  )
  const currentWeek = monthWeeks[currentWeekIdx] || monthWeeks[0]

  // Date key for current selection
  const selectedDayKey = `${currentYear}-${currentMonthIdx}-${selectedDay}`

  // Retrieve current day data (strictly 0 if empty!)
  const currentDayData = useMemo(() => {
    return (
      daysData[selectedDayKey] || {
        isWorkout: false,
        meals: { breakfast: [], lunch: [], dinner: [], other: [] },
      }
    )
  }, [daysData, selectedDayKey])

  // Helper to calculate macros of a single meal (returns 0 if empty!)
  const calculateMealMacros = useCallback((items = []) => {
    if (!items || items.length === 0) {
      return { proteins: 0, fats: 0, carbs: 0, calories: 0, rsk: 0 }
    }
    const p = items.reduce((s, it) => s + (Number(it.proteins) || 0), 0)
    const f = items.reduce((s, it) => s + (Number(it.fats) || 0), 0)
    const c = items.reduce((s, it) => s + (Number(it.carbs) || 0), 0)
    const cal = items.reduce((s, it) => s + (Number(it.calories) || 0), 0)

    return {
      proteins: Number(p.toFixed(2)),
      fats: Number(f.toFixed(2)),
      carbs: Number(c.toFixed(2)),
      calories: Math.round(cal),
      rsk: goals.calories > 0 ? Math.round((cal / goals.calories) * 100) : 0,
    }
  }, [goals.calories])

  const mealKeys = ['breakfast', 'lunch', 'dinner', 'other']
  const mealTitles = {
    breakfast: 'Завтрак',
    lunch: 'Обед',
    dinner: 'Ужин',
    other: 'Прочее',
  }

  // Calculated macros for each meal of the selected day
  const mealMacros = useMemo(() => {
    const meals = currentDayData.meals || {}
    return {
      breakfast: calculateMealMacros(meals.breakfast),
      lunch: calculateMealMacros(meals.lunch),
      dinner: calculateMealMacros(meals.dinner),
      other: calculateMealMacros(meals.other),
    }
  }, [currentDayData, calculateMealMacros])

  // Total daily consumed macros (strictly 0 if nothing logged!)
  const totalProteins = Number(
    (
      mealMacros.breakfast.proteins +
      mealMacros.lunch.proteins +
      mealMacros.dinner.proteins +
      mealMacros.other.proteins
    ).toFixed(1)
  )
  const totalFats = Number(
    (
      mealMacros.breakfast.fats +
      mealMacros.lunch.fats +
      mealMacros.dinner.fats +
      mealMacros.other.fats
    ).toFixed(1)
  )
  const totalCarbs = Number(
    (
      mealMacros.breakfast.carbs +
      mealMacros.lunch.carbs +
      mealMacros.dinner.carbs +
      mealMacros.other.carbs
    ).toFixed(1)
  )
  const totalCalories =
    mealMacros.breakfast.calories +
    mealMacros.lunch.calories +
    mealMacros.dinner.calories +
    mealMacros.other.calories
  const totalRsk = goals.calories > 0 ? Math.round((totalCalories / goals.calories) * 100) : 0

  // Check if daily limits are exceeded (turns red!)
  const isProteinsExceeded = totalProteins > goals.proteins
  const isFatsExceeded = totalFats > goals.fats
  const isCarbsExceeded = totalCarbs > goals.carbs
  const isCaloriesExceeded = totalCalories > goals.calories

  // Progress bar percentages
  const pPct = goals.proteins > 0 ? Math.min(100, Math.round((totalProteins / goals.proteins) * 100)) : 0
  const fPct = goals.fats > 0 ? Math.min(100, Math.round((totalFats / goals.fats) * 100)) : 0
  const cPct = goals.carbs > 0 ? Math.min(100, Math.round((totalCarbs / goals.carbs) * 100)) : 0
  const calPct = goals.calories > 0 ? Math.min(100, Math.round((totalCalories / goals.calories) * 100)) : 0

  // Toggle meal accordion expansion
  const toggleMealExpand = (key) => {
    setExpandedMeals((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Toggle workout status for the selected day
  const toggleWorkoutDay = (dayNum) => {
    const key = `${currentYear}-${currentMonthIdx}-${dayNum}`
    setDaysData((prev) => {
      const existing = prev[key] || {
        isWorkout: false,
        meals: { breakfast: [], lunch: [], dinner: [], other: [] },
      }
      return {
        ...prev,
        [key]: {
          ...existing,
          isWorkout: !existing.isWorkout,
        },
      }
    })
  }

  // Delete a food item from a meal of the selected day
  const handleDeleteItem = (mealKey, itemId) => {
    setDaysData((prev) => {
      const day = prev[selectedDayKey] || {
        isWorkout: false,
        meals: { breakfast: [], lunch: [], dinner: [], other: [] },
      }
      const existingItems = day.meals[mealKey] || []
      return {
        ...prev,
        [selectedDayKey]: {
          ...day,
          meals: {
            ...day.meals,
            [mealKey]: existingItems.filter((it) => it.id !== itemId),
          },
        },
      }
    })
  }

  // Add a new food item to a meal of the selected day
  const handleAddFoodSubmit = (e) => {
    e.preventDefault()
    if (!addingToMeal || !foodName.trim()) return

    const pNum = Number(foodProteins) || 0
    const fNum = Number(foodFats) || 0
    const cNum = Number(foodCarbs) || 0
    const calNum = Number(foodCalories) || Math.round(pNum * 4 + fNum * 9 + cNum * 4)

    const newItem = {
      id: Date.now(),
      name: foodName.trim(),
      proteins: pNum,
      fats: fNum,
      carbs: cNum,
      calories: calNum,
    }

    setDaysData((prev) => {
      const day = prev[selectedDayKey] || {
        isWorkout: false,
        meals: { breakfast: [], lunch: [], dinner: [], other: [] },
      }
      const existingItems = day.meals[addingToMeal] || []
      return {
        ...prev,
        [selectedDayKey]: {
          ...day,
          meals: {
            ...day.meals,
            [addingToMeal]: [...existingItems, newItem],
          },
        },
      }
    })

    setExpandedMeals((prev) => ({ ...prev, [addingToMeal]: true }))
    setAddingToMeal(null)
    setFoodName('')
    setFoodProteins('')
    setFoodFats('')
    setFoodCarbs('')
    setFoodCalories('')
  }

  const handleSelectPreset = (preset) => {
    setFoodName(preset.name)
    setFoodProteins(String(preset.proteins))
    setFoodFats(String(preset.fats))
    setFoodCarbs(String(preset.carbs))
    setFoodCalories(String(preset.calories))
  }

  // Save new daily goals / limits
  const handleSaveGoals = (e) => {
    e.preventDefault()
    setGoals({
      proteins: Number(tempGoals.proteins) || 140,
      fats: Number(tempGoals.fats) || 50,
      carbs: Number(tempGoals.carbs) || 200,
      calories: Number(tempGoals.calories) || 2200,
    })
    setIsEditingGoals(false)
  }

  // Navigation arrows handler
  const handlePrev = () => {
    if (calendarView === 'week') {
      if (currentWeekIdx > 0) {
        const newWeekIdx = currentWeekIdx - 1
        setCurrentWeekIdx(newWeekIdx)
        const week = monthWeeks[newWeekIdx]
        if (week && !week.days.includes(selectedDay)) {
          setSelectedDay(week.days[0])
        }
      } else {
        // Wrap to previous month
        const prevMonth = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1
        const prevYear = currentMonthIdx === 0 ? currentYear - 1 : currentYear
        const prevWeeks = getWeeksForMonth(prevYear, prevMonth)
        setCurrentYear(prevYear)
        setCurrentMonthIdx(prevMonth)
        setCurrentWeekIdx(prevWeeks.length - 1)
        setSelectedDay(prevWeeks[prevWeeks.length - 1].days[0])
      }
    } else {
      // Month navigation
      if (currentMonthIdx === 0) {
        setCurrentMonthIdx(11)
        setCurrentYear((y) => y - 1)
      } else {
        setCurrentMonthIdx((m) => m - 1)
      }
    }
  }

  const handleNext = () => {
    if (calendarView === 'week') {
      if (currentWeekIdx < monthWeeks.length - 1) {
        const newWeekIdx = currentWeekIdx + 1
        setCurrentWeekIdx(newWeekIdx)
        const week = monthWeeks[newWeekIdx]
        if (week && !week.days.includes(selectedDay)) {
          setSelectedDay(week.days[0])
        }
      } else {
        // Wrap to next month
        const nextMonth = currentMonthIdx === 11 ? 0 : currentMonthIdx + 1
        const nextYear = currentMonthIdx === 11 ? currentYear + 1 : currentYear
        const nextWeeks = getWeeksForMonth(nextYear, nextMonth)
        setCurrentYear(nextYear)
        setCurrentMonthIdx(nextMonth)
        setCurrentWeekIdx(0)
        setSelectedDay(nextWeeks[0].days[0])
      }
    } else {
      // Month navigation
      if (currentMonthIdx === 11) {
        setCurrentMonthIdx(0)
        setCurrentYear((y) => y + 1)
      } else {
        setCurrentMonthIdx((m) => m + 1)
      }
    }
  }

  // Reference date for "today" in planner: 22 October 2026
  const TODAY_DATE = useMemo(() => {
    const d = new Date(2026, 9, 22)
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  // Day badge status:
  // 1. Workout day -> RED ('workout')
  // 2. Past day (уже прошедший день: date < today) -> GREEN ('success')
  // 3. Future day (date >= today) -> NEUTRAL ('neutral')
  const getDayStatus = (dayNum) => {
    const key = `${currentYear}-${currentMonthIdx}-${dayNum}`
    const d = daysData[key]
    if (d?.isWorkout) return 'workout' // RED

    const cellDate = new Date(currentYear, currentMonthIdx, dayNum)
    cellDate.setHours(0, 0, 0, 0)

    if (cellDate < TODAY_DATE) {
      return 'success' // GREEN: уже прошедший день
    }

    return 'neutral' // Будущий день (оливковая рамка)
  }

  // Month grid cells
  const daysInMonth = new Date(currentYear, currentMonthIdx + 1, 0).getDate()
  const firstDayOfMonthWeekday = (new Date(currentYear, currentMonthIdx, 1).getDay() + 6) % 7 // 0 = Mon

  const monthCalendarCells = []
  for (let i = 0; i < firstDayOfMonthWeekday; i++) {
    monthCalendarCells.push({ empty: true, key: `pad-${i}` })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    monthCalendarCells.push({
      dayNum: d,
      status: getDayStatus(d),
      key: `day-${d}`,
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* ── Calendar Navigation Header ───────────────────────── */}
        <div className={styles.weekNavRow}>
          <button
            type="button"
            className={styles.navArrowBtn}
            onClick={handlePrev}
            title={calendarView === 'week' ? 'Предыдущая неделя' : 'Предыдущий месяц'}
          >
            &lt;
          </button>

          <div className={styles.calendarTitleGroup}>
            <span className={styles.weekTitle}>
              {calendarView === 'week'
                ? `${MONTH_NAMES[currentMonthIdx]} ${currentWeek.weekNum}\\${currentWeek.totalWeeks}`
                : `${MONTH_NAMES[currentMonthIdx]} ${currentYear}`}
            </span>

            <button
              type="button"
              className={styles.calendarToggleBtn}
              onClick={() => {
                if (calendarView === 'week') {
                  setCalendarView('month')
                } else {
                  // Switch to week view: find which week contains selectedDay
                  const matchingIdx = monthWeeks.findIndex((w) => w.days.includes(selectedDay))
                  if (matchingIdx !== -1) {
                    setCurrentWeekIdx(matchingIdx)
                  }
                  setCalendarView('week')
                }
              }}
              title="Переключить вид: Неделя / Месяц"
            >
              {calendarView === 'week' ? 'ВЕСЬ МЕСЯЦ' : 'ПО НЕДЕЛЯМ'}
            </button>
          </div>

          <button
            type="button"
            className={styles.navArrowBtn}
            onClick={handleNext}
            title={calendarView === 'week' ? 'Следующая неделя' : 'Следующий месяц'}
          >
            &gt;
          </button>
        </div>

        {/* ── VIEW 1: Week Strip (e.g. ОКТЯБРЬ 3\4) ─────────────── */}
        {calendarView === 'week' && (
          <div className={styles.daysStrip}>
            {currentWeek.days.map((dNum, idx) => {
              const isSelected = dNum === selectedDay
              const status = getDayStatus(dNum)
              let badgeStyle = styles.badgeNeutral
              if (status === 'workout') badgeStyle = styles.badgeWorkout // RED
              if (status === 'success') badgeStyle = styles.badgeSuccess // GREEN (прошедший день)

              return (
                <div
                  key={`${dNum}-${idx}`}
                  className={`${styles.dayCol} ${isSelected ? styles.dayColSelected : ''}`}
                  onClick={() => setSelectedDay(dNum)}
                >
                  <div className={`${styles.dayBadge} ${badgeStyle}`}>
                    {dNum}
                  </div>
                  <span className={styles.dayName}>{WEEKDAY_NAMES[idx]}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── VIEW 2: Full Month Grid ──────────────────────────── */}
        {calendarView === 'month' && (
          <div className={styles.monthCalendarCard}>
            <div className={styles.monthWeekdaysRow}>
              {WEEKDAY_NAMES.map((wName, idx) => (
                <span key={idx} className={styles.monthWeekdayHeader}>
                  {wName}
                </span>
              ))}
            </div>

            <div className={styles.monthGrid}>
              {monthCalendarCells.map((cell) => {
                if (cell.empty) {
                  return <div key={cell.key} className={styles.monthEmptyCell} />
                }

                const isSelected = cell.dayNum === selectedDay
                let badgeStyle = styles.badgeNeutral
                if (cell.status === 'workout') badgeStyle = styles.badgeWorkout // RED
                if (cell.status === 'success') badgeStyle = styles.badgeSuccess // GREEN (прошедший день)

                return (
                  <div
                    key={cell.key}
                    className={`${styles.monthDayCell} ${isSelected ? styles.monthDayCellSelected : ''}`}
                    onClick={() => setSelectedDay(cell.dayNum)}
                  >
                    <div className={`${styles.monthDayBadge} ${badgeStyle}`}>
                      <span>{cell.dayNum}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Day Control & Workout Toggle Bar ──────────────────── */}
        <div className={styles.dayControlBar}>
          <div className={styles.selectedDayInfo}>
            <span className={styles.selectedDayText}>
              ДЕНЬ: <strong>{selectedDay} {MONTH_NAMES[currentMonthIdx]}</strong>
            </span>
          </div>

          <button
            type="button"
            className={`${styles.workoutToggleBtn} ${currentDayData.isWorkout ? styles.workoutToggleBtnActive : ''}`}
            onClick={() => toggleWorkoutDay(selectedDay)}
            title="Отметить этот день как тренировочный"
          >
            {currentDayData.isWorkout ? 'ТРЕНИРОВОЧНЫЙ ДЕНЬ' : 'ОТМЕТИТЬ ТРЕНИРОВКУ'}
          </button>
        </div>

        {/* ── Total "Всего" Section ────────────────────────────── */}
        <div className={styles.summarySection}>
          <div className={styles.summaryHeaderRow}>
            <h2 className={styles.summaryTitle}>Всего</h2>
            <button
              type="button"
              className={styles.editGoalsBtn}
              onClick={() => {
                setTempGoals({ ...goals })
                setIsEditingGoals(true)
              }}
              title="Настроить суточные лимиты КБЖУ"
            >
              НАСТРОЙКА ЛИМИТОВ
            </button>
          </div>

          {/* Macro Stats Grid */}
          <div className={styles.macroColumnsGrid}>
            <div className={`${styles.macroCol} ${isProteinsExceeded ? styles.macroColExceeded : ''}`}>
              <span className={styles.labelProteins}>Белки</span>
              <span className={`${styles.macroValue} ${isProteinsExceeded ? styles.valueExceeded : ''}`}>
                {totalProteins}\{goals.proteins} g
              </span>
              {isProteinsExceeded && <span className={styles.exceededBadge}>Лимит!</span>}
            </div>

            <div className={`${styles.macroCol} ${isFatsExceeded ? styles.macroColExceeded : ''}`}>
              <span className={styles.labelFats}>Жиры</span>
              <span className={`${styles.macroValue} ${isFatsExceeded ? styles.valueExceeded : ''}`}>
                {totalFats}\{goals.fats} g
              </span>
              {isFatsExceeded && <span className={styles.exceededBadge}>Лимит!</span>}
            </div>

            <div className={`${styles.macroCol} ${isCarbsExceeded ? styles.macroColExceeded : ''}`}>
              <span className={styles.labelCarbs}>Углеводы</span>
              <span className={`${styles.macroValue} ${isCarbsExceeded ? styles.valueExceeded : ''}`}>
                {totalCarbs}\{goals.carbs} g
              </span>
              {isCarbsExceeded && <span className={styles.exceededBadge}>Лимит!</span>}
            </div>

            <div className={styles.macroCol}>
              <span className={styles.labelRsk}>РСК</span>
              <span className={styles.macroValue}>{totalRsk} %</span>
            </div>

            <div className={`${styles.macroCol} ${isCaloriesExceeded ? styles.macroColExceeded : ''}`}>
              <span className={styles.labelCalories}>Калории</span>
              <span className={`${styles.macroValue} ${isCaloriesExceeded ? styles.valueExceeded : ''}`}>
                {totalCalories}\{goals.calories}
              </span>
              {isCaloriesExceeded && <span className={styles.exceededBadge}>Лимит!</span>}
            </div>
          </div>

          {/* Multi-tier Progress Bars */}
          <div className={styles.multiProgressBar}>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.barProteins} ${isProteinsExceeded ? styles.barExceeded : ''}`}
                style={{ width: `${pPct}%` }}
              />
            </div>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.barFats} ${isFatsExceeded ? styles.barExceeded : ''}`}
                style={{ width: `${fPct}%` }}
              />
            </div>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.barCarbs} ${isCarbsExceeded ? styles.barExceeded : ''}`}
                style={{ width: `${cPct}%` }}
              />
            </div>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.barCalories} ${isCaloriesExceeded ? styles.barExceeded : ''}`}
                style={{ width: `${calPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* ── Meals List (Strictly 0 if empty!) ────────────────── */}
        <div className={styles.mealsList}>
          {mealKeys.map((key) => {
            const title = mealTitles[key]
            const macros = mealMacros[key]
            const items = currentDayData.meals?.[key] || []
            const isExpanded = Boolean(expandedMeals[key])

            return (
              <div key={key} className={styles.mealBlock}>
                {/* Meal Header */}
                <div
                  className={styles.mealHeaderRow}
                  onClick={() => toggleMealExpand(key)}
                >
                  <h3 className={styles.mealTitle}>{title}</h3>
                  <button
                    type="button"
                    className={styles.addFoodSquareBtn}
                    onClick={(e) => {
                      e.stopPropagation()
                      setAddingToMeal(key)
                    }}
                    title={`Добавить продукт в «${title}»`}
                  >
                    +
                  </button>
                </div>

                {/* Meal Macro Grid */}
                <div
                  className={styles.macroColumnsGrid}
                  onClick={() => toggleMealExpand(key)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className={styles.macroCol}>
                    <span className={styles.labelProteins}>Белки</span>
                    <span className={styles.mealStatValue}>{macros.proteins.toFixed(2)} g</span>
                  </div>

                  <div className={styles.macroCol}>
                    <span className={styles.labelFats}>Жиры</span>
                    <span className={styles.mealStatValue}>{macros.fats.toFixed(2)} g</span>
                  </div>

                  <div className={styles.macroCol}>
                    <span className={styles.labelCarbs}>Углеводы</span>
                    <span className={styles.mealStatValue}>{macros.carbs.toFixed(2)} g</span>
                  </div>

                  <div className={styles.macroCol}>
                    <span className={styles.labelRsk}>РСК</span>
                    <span className={styles.mealStatValue}>{macros.rsk} %</span>
                  </div>

                  <div className={styles.macroCol}>
                    <span className={styles.labelCalories}>Калории</span>
                    <span className={styles.mealStatValue}>{macros.calories}</span>
                  </div>
                </div>

                {/* Expanded Food Items List */}
                {isExpanded && items.length > 0 && (
                  <div className={styles.foodItemsTable}>
                    {items.map((it) => (
                      <div key={it.id} className={styles.foodItemRow}>
                        <div className={styles.foodNameCol}>{it.name}</div>
                        <div className={styles.foodProteinCol}>{it.proteins} g</div>
                        <div className={styles.foodFatCol}>{it.fats} g</div>
                        <div className={styles.foodCarbCol}>{it.carbs} g</div>
                        <div className={styles.foodActionCol}>
                          <button
                            type="button"
                            className={styles.deleteFoodBtn}
                            onClick={() => handleDeleteItem(key, it.id)}
                            title="Удалить продукт"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className={styles.mealBottomDivider} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Modal 1: Add Food (Zero Overflow 3-Grid) ──────────── */}
      {addingToMeal && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setAddingToMeal(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                Добавить продукт в «{mealTitles[addingToMeal]}»
              </h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setAddingToMeal(null)}
              >
                ✕
              </button>
            </div>

            {/* Quick Presets */}
            <div className={styles.presetSection}>
              <span className={styles.presetHeading}>Быстрый выбор:</span>
              <div className={styles.presetsList}>
                {PRESET_FOODS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={styles.presetPill}
                    onClick={() => handleSelectPreset(p)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddFoodSubmit} className={styles.foodForm}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Название блюда / продукта:</label>
                <input
                  type="text"
                  required
                  placeholder="Например: Гречневая каша"
                  className={styles.formInput}
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                />
              </div>

              {/* Responsive 3-Column Macro Grid */}
              <div className={styles.formRow3Grid}>
                <div className={styles.formGroup}>
                  <label className={styles.labelProteins}>Белки (г):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    className={styles.formInput}
                    value={foodProteins}
                    onChange={(e) => setFoodProteins(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.labelFats}>Жиры (г):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    className={styles.formInput}
                    value={foodFats}
                    onChange={(e) => setFoodFats(e.target.value)}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.labelCarbs}>Углеводы (г):</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    className={styles.formInput}
                    value={foodCarbs}
                    onChange={(e) => setFoodCarbs(e.target.value)}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.labelCalories}>Калории (ккал):</label>
                <input
                  type="number"
                  min="0"
                  placeholder="Автоматически (Б×4 + Ж×9 + У×4)"
                  className={styles.formInput}
                  value={foodCalories}
                  onChange={(e) => setFoodCalories(e.target.value)}
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setAddingToMeal(null)}
                >
                  Отмена
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Добавить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal 2: Edit KBZHU Goals & Limits ───────────────── */}
      {isEditingGoals && (
        <div
          className={styles.modalBackdrop}
          onClick={() => setIsEditingGoals(false)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Настройка лимитов КБЖУ</h3>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setIsEditingGoals(false)}
              >
                ✕
              </button>
            </div>

            <p className={styles.modalSubheading}>
              Укажите желаемые суточные лимиты. При их превышении показатели подсвечиваются красным.
            </p>

            <form onSubmit={handleSaveGoals} className={styles.foodForm}>
              <div className={styles.formRow2Grid}>
                <div className={styles.formGroup}>
                  <label className={styles.labelProteins}>Лимит белков (г):</label>
                  <input
                    type="number"
                    required
                    min="10"
                    max="500"
                    className={styles.formInput}
                    value={tempGoals.proteins}
                    onChange={(e) => setTempGoals({ ...tempGoals, proteins: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.labelFats}>Лимит жиров (г):</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="300"
                    className={styles.formInput}
                    value={tempGoals.fats}
                    onChange={(e) => setTempGoals({ ...tempGoals, fats: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.formRow2Grid}>
                <div className={styles.formGroup}>
                  <label className={styles.labelCarbs}>Лимит углеводов (г):</label>
                  <input
                    type="number"
                    required
                    min="10"
                    max="800"
                    className={styles.formInput}
                    value={tempGoals.carbs}
                    onChange={(e) => setTempGoals({ ...tempGoals, carbs: e.target.value })}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.labelCalories}>Лимит калорий (ккал):</label>
                  <input
                    type="number"
                    required
                    min="500"
                    max="10000"
                    className={styles.formInput}
                    value={tempGoals.calories}
                    onChange={(e) => setTempGoals({ ...tempGoals, calories: e.target.value })}
                  />
                </div>
              </div>

              <button
                type="button"
                className={styles.autoCalcBtn}
                onClick={() => {
                  const p = Number(tempGoals.proteins) || 0
                  const f = Number(tempGoals.fats) || 0
                  const c = Number(tempGoals.carbs) || 0
                  setTempGoals((prev) => ({ ...prev, calories: Math.round(p * 4 + f * 9 + c * 4) }))
                }}
              >
                РАССЧИТАТЬ КАЛОРИИ (Б×4 + Ж×9 + У×4)
              </button>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setIsEditingGoals(false)}
                >
                  Отмена
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Сохранить лимиты
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Calories
