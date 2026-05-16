/**
 * Loop 53 (Phase H) — UnsavedChangesDialog component (extracted PR #78).
 *
 * Covers the F-0514-17 prompt mechanics:
 *   - mounts only when open=true
 *   - all 3 buttons fire their callbacks
 *   - isWorking lock disables every button (RT-1 data-clobber guard)
 *   - saveLabel customizes the primary button (Save & Quit vs Save & Continue)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import UnsavedChangesDialog from '../../renderer/components/dialogs/UnsavedChangesDialog'

afterEach(cleanup)

describe('UnsavedChangesDialog (Loop 53 / F-0514-17 + RT-1)', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <UnsavedChangesDialog
        open={false}
        body="…"
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={vi.fn()}
      />,
    )
    expect(container.querySelector('.dialog-overlay')).toBeNull()
  })

  it('renders header + body + 3 buttons when open', () => {
    const { getByText } = render(
      <UnsavedChangesDialog
        open
        body="You have unsaved changes."
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={vi.fn()}
      />,
    )
    expect(getByText('Unsaved Changes')).toBeTruthy()
    expect(getByText('You have unsaved changes.')).toBeTruthy()
    expect(getByText('Cancel')).toBeTruthy()
    expect(getByText('Discard Changes')).toBeTruthy()
    expect(getByText('Save & Continue')).toBeTruthy()
  })

  it('Cancel button fires onCancel', () => {
    const onCancel = vi.fn()
    const { getByText } = render(
      <UnsavedChangesDialog open body="x" onCancel={onCancel} onDiscard={vi.fn()} onSaveAndContinue={vi.fn()} />,
    )
    fireEvent.click(getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('Discard Changes fires onDiscard', () => {
    const onDiscard = vi.fn()
    const { getByText } = render(
      <UnsavedChangesDialog open body="x" onCancel={vi.fn()} onDiscard={onDiscard} onSaveAndContinue={vi.fn()} />,
    )
    fireEvent.click(getByText('Discard Changes'))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('Save & Continue fires onSaveAndContinue', () => {
    const onSave = vi.fn()
    const { getByText } = render(
      <UnsavedChangesDialog open body="x" onCancel={vi.fn()} onDiscard={vi.fn()} onSaveAndContinue={onSave} />,
    )
    fireEvent.click(getByText('Save & Continue'))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('saveLabel="Save & Quit" customizes the primary button label', () => {
    const { getByText, queryByText } = render(
      <UnsavedChangesDialog
        open
        body="x"
        saveLabel="Save & Quit"
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={vi.fn()}
      />,
    )
    expect(getByText('Save & Quit')).toBeTruthy()
    expect(queryByText('Save & Continue')).toBeNull()
  })

  it('RT-1: isWorking=true disables ALL three buttons (no Discard mid-save race)', () => {
    const onCancel = vi.fn()
    const onDiscard = vi.fn()
    const onSave = vi.fn()
    const { container, getByText } = render(
      <UnsavedChangesDialog
        open
        body="x"
        isWorking
        onCancel={onCancel}
        onDiscard={onDiscard}
        onSaveAndContinue={onSave}
      />,
    )
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(3)
    buttons.forEach((b) => expect((b as HTMLButtonElement).disabled).toBe(true))

    // Clicks on disabled buttons MUST NOT fire their callbacks.
    fireEvent.click(getByText('Cancel'))
    fireEvent.click(getByText('Discard Changes'))
    fireEvent.click(getByText('Saving…'))
    expect(onCancel).not.toHaveBeenCalled()
    expect(onDiscard).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('RT-1: isWorking=true swaps the save button label to "Saving…"', () => {
    const { getByText } = render(
      <UnsavedChangesDialog
        open
        body="x"
        isWorking
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={vi.fn()}
      />,
    )
    expect(getByText('Saving…')).toBeTruthy()
  })

  it('async onSaveAndContinue: void-returning promise is fired without await', () => {
    let resolved = false
    const onSave = vi.fn(() => Promise.resolve().then(() => { resolved = true }))
    const { getByText } = render(
      <UnsavedChangesDialog
        open
        body="x"
        onCancel={vi.fn()}
        onDiscard={vi.fn()}
        onSaveAndContinue={onSave}
      />,
    )
    fireEvent.click(getByText('Save & Continue'))
    expect(onSave).toHaveBeenCalledTimes(1)
    // The click handler fire-and-forgets (void onSaveAndContinue()); the
    // caller is responsible for managing isWorking around the await.
    expect(resolved).toBe(false) // microtask hasn't drained yet
  })
})
