---
name: crash-report
description: Read all Entropic crash dumps, logs, and error data to diagnose a crash or error
---

Read and summarize the following diagnostic data for Entropic v2 Challenger:

1. List and read all crash dump files (newest first):
   `~/.entropic/crash_reports/crash_*.json`

2. Read the last 100 lines of the Python sidecar log:
   `~/.entropic/logs/sidecar.log`

3. Read the last 100 lines of the Electron main process log:
   `~/.entropic/logs/electron-main.log`

4. Read the fault handler log (if it exists):
   `~/.entropic/logs/sidecar_fault.log`

5. Check for autosave files indicating unclean shutdown:
   Look for `.autosave.glitch` files

Present findings as:
- **Crash Summary**: What crashed, when, exception type
- **Last Operations**: What was happening before the crash (from log entries)
- **Effect Chain**: If visible in logs, what effects were active
- **Suggested Cause**: Based on the traceback and context
- **Next Steps**: What to investigate or fix

If no crash data exists, say so and ask the user to describe what happened.
