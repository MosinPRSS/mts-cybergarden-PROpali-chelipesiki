import chestOverlay from '../assets/ChestPicked.svg'
import latsOverlay from '../assets/LatsPicked.svg'

export const MUSCLE_GROUPS = [
  {
    id: 'chest',
    label: 'Грудь',
    labelEn: 'CHEST',
    view: 'front',
    overlay: chestOverlay,
    overlayStyle: { top: '21%', left: '30.5%', width: '32.2%' },
  },
  {
    id: 'shoulders',
    label: 'Плечи',
    labelEn: 'SHOULDERS',
    view: 'front',
    overlay: null,
    overlayStyle: {},
  },
  {
    id: 'biceps',
    label: 'Бицепс',
    labelEn: 'BICEPS',
    view: 'front',
    overlay: null,
    overlayStyle: {},
  },
  {
    id: 'triceps',
    label: 'Трицепс',
    labelEn: 'TRICEPS',
    view: 'front',
    overlay: null,
    overlayStyle: {},
  },
  {
    id: 'core',
    label: 'Кор',
    labelEn: 'CORE',
    view: 'front',
    overlay: null,
    overlayStyle: {},
  },
  {
    id: 'lats',
    label: 'Спина',
    labelEn: 'LATS',
    view: 'back',
    overlay: latsOverlay,
    overlayStyle: { top: '28%', left: '30%', width: '36%' },
  },
]

export function getMuscleGroup(id) {
  return MUSCLE_GROUPS.find((m) => m.id === id)
}
