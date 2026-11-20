import { createContext, useContext, useEffect, useRef, useState } from 'react'

const IncidentsContext = createContext(null)

export function IncidentsProvider({ children }) {
  const [incidents, setIncidents] = useState([])
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  // slaTimers: { [id]: remainingSeconds }
  const timersRef = useRef({})
  const [tick, setTick] = useState(0) // force re-render every second

  // Initial fetch
  useEffect(() => {
    fetch('/api/incidents')
      .then((r) => r.json())
      .then((data) => {
        seedTimers(data)
        setIncidents(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // SSE stream
  useEffect(() => {
    let es
    let retryTimeout

    function connect() {
      es = new EventSource('/api/incidents/stream')
      es.onopen = () => setConnected(true)
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          seedTimers(data)
          setIncidents(data)
          setLoading(false)
        } catch {}
      }
      es.onerror = () => {
        setConnected(false)
        es.close()
        retryTimeout = setTimeout(connect, 5000)
      }
    }

    connect()
    return () => {
      es?.close()
      clearTimeout(retryTimeout)
    }
  }, [])

  // SLA countdown ticker
  useEffect(() => {
    const id = setInterval(() => {
      const t = timersRef.current
      let changed = false
      for (const key of Object.keys(t)) {
        if (t[key] > 0) {
          t[key] -= 1
          changed = true
        }
      }
      if (changed) setTick((n) => n + 1)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  function seedTimers(data) {
    const t = timersRef.current
    for (const inc of data) {
      if (!(inc.id in t)) t[inc.id] = inc.sla
    }
  }

  function getSla(id) {
    return timersRef.current[id] ?? 0
  }

  return (
    <IncidentsContext.Provider value={{ incidents, connected, loading, getSla, tick }}>
      {children}
    </IncidentsContext.Provider>
  )
}

export function useIncidents() {
  return useContext(IncidentsContext)
}
