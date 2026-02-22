import { useEngineStore } from './stores/engine'

export default function App() {
  const { status, uptime } = useEngineStore()

  const color: Record<string, string> = {
    connected: '#4ade80',
    disconnected: '#ef4444',
    restarting: '#f59e0b',
  }

  const label: Record<string, string> = {
    connected: 'Engine: Connected',
    disconnected: 'Engine: Disconnected',
    restarting: 'Engine: Restarting...',
  }

  return (
    <div className="app">
      <div className="status-bar">
        <div
          className="status-indicator"
          style={{ backgroundColor: color[status] }}
        />
        <span className="status-text">{label[status]}</span>
        {status === 'connected' && uptime !== undefined && (
          <span className="uptime">Uptime: {uptime}s</span>
        )}
      </div>
    </div>
  )
}
