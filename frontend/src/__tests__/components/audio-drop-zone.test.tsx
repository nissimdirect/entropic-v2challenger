import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import DropZone from '../../renderer/components/upload/DropZone'

// Mock window.entropic so DropZone's getPathForFile path hits the fallback
// (which returns file.path). In jsdom, File has no path property, so we shim it.
;(globalThis as any).window = {
  entropic: {
    getPathForFile: (f: File) => `/tmp/${f.name}`,
  },
}

function makeFileList(files: File[]): FileList {
  const arr: any = files
  arr.item = (i: number) => files[i]
  Object.defineProperty(arr, 'length', { value: files.length })
  return arr as FileList
}

describe('DropZone — audio routing', () => {
  let onFileDrop: ReturnType<typeof vi.fn>
  let onAudioDrop: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onFileDrop = vi.fn()
    onAudioDrop = vi.fn()
  })

  it('routes .wav to onAudioDrop when provided', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const file = new File(['sound'], 'kick.wav', { type: 'audio/wav' })
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList([file]), types: ['Files'] },
    })
    expect(onAudioDrop).toHaveBeenCalledWith('/tmp/kick.wav')
    expect(onFileDrop).not.toHaveBeenCalled()
  })

  it('routes .mp4 to onFileDrop (video path unchanged)', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const file = new File(['vid'], 'clip.mp4', { type: 'video/mp4' })
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList([file]), types: ['Files'] },
    })
    expect(onFileDrop).toHaveBeenCalledWith('/tmp/clip.mp4')
    expect(onAudioDrop).not.toHaveBeenCalled()
  })

  it('falls back to onFileDrop for audio when onAudioDrop missing', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const file = new File(['sound'], 'song.mp3', { type: 'audio/mpeg' })
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList([file]), types: ['Files'] },
    })
    expect(onFileDrop).toHaveBeenCalledWith('/tmp/song.mp3')
  })

  it('rejects batch drops over the cap (8)', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const files = Array.from({ length: 9 }, (_, i) => new File([''], `f${i}.wav`))
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList(files), types: ['Files'] },
    })
    expect(onAudioDrop).not.toHaveBeenCalled()
    expect(onFileDrop).not.toHaveBeenCalled()
    expect(container.querySelector('.drop-zone__error')!.textContent).toMatch(/Too many files/)
  })

  it('accepts exactly 8 files', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const files = Array.from({ length: 8 }, (_, i) => new File([''], `f${i}.wav`))
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList(files), types: ['Files'] },
    })
    expect(onAudioDrop).toHaveBeenCalledTimes(8)
  })

  it('rejects unsupported extensions with error', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const file = new File([''], 'script.exe')
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList([file]), types: ['Files'] },
    })
    expect(onFileDrop).not.toHaveBeenCalled()
    expect(onAudioDrop).not.toHaveBeenCalled()
    expect(container.querySelector('.drop-zone__error')).toBeTruthy()
  })

  it('mixed drop: routes audio + video separately', () => {
    const { container } = render(<DropZone onFileDrop={onFileDrop} onAudioDrop={onAudioDrop} />)
    const dropEl = container.querySelector('.drop-zone')!
    const files = [
      new File([''], 'clip.mp4'),
      new File([''], 'kick.wav'),
      new File([''], 'snare.flac'),
    ]
    fireEvent.drop(dropEl, {
      dataTransfer: { files: makeFileList(files), types: ['Files'] },
    })
    expect(onFileDrop).toHaveBeenCalledWith('/tmp/clip.mp4')
    expect(onAudioDrop).toHaveBeenCalledWith('/tmp/kick.wav')
    expect(onAudioDrop).toHaveBeenCalledWith('/tmp/snare.flac')
  })
})
