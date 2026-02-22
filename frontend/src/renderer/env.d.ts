interface Window {
  entropic: {
    onEngineStatus: (
      callback: (data: { status: string; uptime?: number }) => void,
    ) => void
  }
}
