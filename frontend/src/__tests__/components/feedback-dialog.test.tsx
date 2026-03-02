/**
 * FeedbackDialog tests.
 * Sprint 3B — verifies rendering, textarea limit, send/cancel.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { setupMockEntropic, teardownMockEntropic } from '../helpers/mock-entropic'
import type { EntropicBridge } from '../helpers/mock-entropic'

import FeedbackDialog from '../../renderer/components/dialogs/FeedbackDialog'

let mock: EntropicBridge

beforeEach(() => {
  mock = setupMockEntropic()
})

afterEach(() => {
  cleanup()
  teardownMockEntropic()
})

describe('FeedbackDialog', () => {
  it('renders nothing when isOpen=false', () => {
    render(<FeedbackDialog isOpen={false} onClose={vi.fn()} />)
    expect(document.querySelector('.feedback-dialog')).toBeNull()
  })

  it('renders dialog when isOpen=true', () => {
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)
    expect(document.querySelector('.feedback-dialog')).not.toBeNull()
    expect(document.querySelector('.feedback-dialog__header')?.textContent).toContain(
      'Report a Bug',
    )
  })

  it('Send button is disabled when textarea is empty', () => {
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)
    const sendBtn = document.querySelector('.feedback-dialog__btn--send') as HTMLButtonElement
    expect(sendBtn.disabled).toBe(true)
  })

  it('Send button becomes enabled when text is entered', () => {
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)
    const textarea = document.querySelector('.feedback-dialog__textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Something broke' } })

    const sendBtn = document.querySelector('.feedback-dialog__btn--send') as HTMLButtonElement
    expect(sendBtn.disabled).toBe(false)
  })

  it('Cancel calls onClose', () => {
    const onClose = vi.fn()
    render(<FeedbackDialog isOpen={true} onClose={onClose} />)
    const cancelBtn = document.querySelector('.feedback-dialog__btn--cancel') as HTMLElement
    fireEvent.click(cancelBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('Send calls submitFeedback with trimmed text', async () => {
    vi.useFakeTimers()
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)

    const textarea = document.querySelector('.feedback-dialog__textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '  Bug report text  ' } })

    const sendBtn = document.querySelector('.feedback-dialog__btn--send') as HTMLElement
    fireEvent.click(sendBtn)

    // Wait for async submitFeedback
    await vi.runAllTimersAsync()

    expect(mock.submitFeedback).toHaveBeenCalledWith('Bug report text')
    vi.useRealTimers()
  })

  it('shows character count', () => {
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)
    const charCount = document.querySelector('.feedback-dialog__char-count')
    expect(charCount?.textContent).toContain('0/2000')

    const textarea = document.querySelector('.feedback-dialog__textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Hello' } })

    expect(charCount?.textContent).toContain('5/2000')
  })

  it('has a close X button', () => {
    render(<FeedbackDialog isOpen={true} onClose={vi.fn()} />)
    expect(document.querySelector('.feedback-dialog__close')).not.toBeNull()
  })
})
