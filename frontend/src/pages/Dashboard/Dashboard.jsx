import { useState } from 'react'
import { IncidentsProvider } from '../../context/IncidentsContext'
import DashSidebar from './DashSidebar'
import DashTopbar from './DashTopbar'
import DashStats from './DashStats'
import DashBoard from './DashBoard'
import IncidentDrawer from './IncidentDrawer'
import s from './Dashboard.module.css'

export default function Dashboard() {
  const [theme, setTheme] = useState('dark')
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'mine'
  const [openIncident, setOpenIncident] = useState(null)

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return (
    <IncidentsProvider>
      <div className={`${s.root} ${s[theme]}`} data-theme={theme}>
        <DashSidebar />
        <div className={s.main}>
          <DashTopbar
            theme={theme}
            onToggleTheme={toggleTheme}
            search={search}
            onSearch={setSearch}
          />
          <div className={s.content}>
            <DashStats />
            {/* Filter toolbar */}
            <div className={s.toolbar}>
              <div className={s.tabGroup}>
                <button
                  className={`${s.tabBtn} ${activeTab === 'all' ? s.tabActive : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  Все инциденты
                </button>
                <button
                  className={`${s.tabBtn} ${activeTab === 'mine' ? s.tabActive : ''}`}
                  onClick={() => setActiveTab('mine')}
                >
                  Моя команда
                </button>
              </div>
              <span className={s.toolbarSpacer} />
              <button className={s.filterBtn}>
                <FilterIcon /> Фильтры
              </button>
              <button className={s.filterBtn}>
                <CalendarIcon /> Сегодня
              </button>
            </div>

            <DashBoard
              search={search}
              activeTab={activeTab}
              onCardClick={setOpenIncident}
            />
          </div>
        </div>

        <IncidentDrawer
          incident={openIncident}
          onClose={() => setOpenIncident(null)}
        />
      </div>
    </IncidentsProvider>
  )
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
    </svg>
  )
}
function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
