interface WelcomeScreenProps {
  isVisible: boolean
  recentProjects: Array<{ path: string; name: string; lastModified: number }>
  onNewProject: () => void
  onOpenProject: () => void
  onOpenRecent: (path: string) => void
}

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  const seconds = Math.floor(delta / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return days === 1 ? '1 day ago' : `${days} days ago`
  if (hours > 0) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  if (minutes > 0) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  return 'just now'
}

export default function WelcomeScreen({
  isVisible,
  recentProjects,
  onNewProject,
  onOpenProject,
  onOpenRecent,
}: WelcomeScreenProps) {
  if (!isVisible) return null

  return (
    <div className="welcome-screen">
      <div className="welcome-screen__content">
        <div className="welcome-screen__logo">ENTROPIC</div>
        <div className="welcome-screen__version">v2.0.0</div>

        <div className="welcome-screen__actions">
          <button
            className="welcome-screen__btn welcome-screen__btn--primary"
            onClick={onNewProject}
          >
            New Project
          </button>
          <button
            className="welcome-screen__btn"
            onClick={onOpenProject}
          >
            Open Project
          </button>
        </div>

        <div className="welcome-screen__recent">
          <div className="welcome-screen__recent-title">Recent Projects</div>
          {recentProjects.length === 0 ? (
            <div className="welcome-screen__recent-empty">No recent projects</div>
          ) : (
            <div className="welcome-screen__recent-list">
              {recentProjects.map((project) => (
                <button
                  key={project.path}
                  className="welcome-screen__recent-item"
                  onClick={() => onOpenRecent(project.path)}
                >
                  <span className="welcome-screen__recent-name">{project.name}</span>
                  <span className="welcome-screen__recent-path">{project.path}</span>
                  <span className="welcome-screen__recent-time">
                    {formatRelativeTime(project.lastModified)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
