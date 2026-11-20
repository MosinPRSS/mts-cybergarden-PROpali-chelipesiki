/** Format seconds → "Xч YYм" or "MM:SS" */
export function fmtSla(secs) {
  if (secs <= 0) return '00:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}ч ${String(m).padStart(2, '0')}м`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 'urgent' | 'warning' | 'ok' | 'resolved' */
export function slaStatus(secs, priority) {
  if (priority === 'Resolved') return 'resolved'
  if (secs <= 0) return 'resolved'
  if (secs < 600) return 'urgent'
  if (secs < 2000) return 'warning'
  return 'ok'
}

const COLORS = [
  '#3d8bff', '#ff4757', '#ff8c00', '#22c55e',
  '#a78bfa', '#06b6d4', '#f43f5e', '#84cc16', '#f97316',
]

export function avatarColor(name) {
  if (!name) return '#8b8fa8'
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return COLORS[Math.abs(h) % COLORS.length]
}

export function initials(name) {
  if (!name) return '?'
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('')
}

export const PRIORITY_COLUMN = {
  Critical: 'critical',
  High: 'high',
  Assigned: 'assigned',
  Resolved: 'resolved',
}

export const COLUMN_META = {
  critical: { label: 'Критические', dotClass: 'crit', countClass: 'crit' },
  high:     { label: 'Высокий риск', dotClass: 'high', countClass: 'high' },
  assigned: { label: 'На координаторах', dotClass: 'asgn', countClass: 'asgn' },
  resolved: { label: 'Решено', dotClass: 'rslv', countClass: 'rslv' },
}

export const PRIORITY_BADGE = {
  Critical: { cls: 'badgeCritical', label: 'Критический' },
  High:     { cls: 'badgeHigh',     label: 'Высокий' },
  Assigned: { cls: 'badgeAssigned', label: 'Назначен' },
  Resolved: { cls: 'badgeResolved', label: 'Решено' },
}

export const MY_TEAM = 'КЦ ИТ Координаторы'
