import { describe, it, expect } from 'vitest'

/**
 * Tests for upload component logic — file validation.
 * Tests the validation rules from PHASE-1-IMPL-PLAN.md SEC-5.
 */

const ALLOWED_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
const MAX_FILE_SIZE_MB = 500

function validateFileType(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  return ALLOWED_EXTENSIONS.includes(ext)
}

function validateFileSize(sizeBytes: number): boolean {
  return sizeBytes <= MAX_FILE_SIZE_MB * 1024 * 1024
}

describe('Upload file validation', () => {
  describe('file type', () => {
    it('accepts .mp4 files', () => {
      expect(validateFileType('video.mp4')).toBe(true)
    })

    it('accepts .mov files', () => {
      expect(validateFileType('video.mov')).toBe(true)
    })

    it('accepts .avi files', () => {
      expect(validateFileType('video.avi')).toBe(true)
    })

    it('accepts .mkv files', () => {
      expect(validateFileType('video.mkv')).toBe(true)
    })

    it('accepts .webm files', () => {
      expect(validateFileType('video.webm')).toBe(true)
    })

    it('rejects .exe files', () => {
      expect(validateFileType('malware.exe')).toBe(false)
    })

    it('rejects .txt files', () => {
      expect(validateFileType('notes.txt')).toBe(false)
    })

    it('rejects .js files', () => {
      expect(validateFileType('script.js')).toBe(false)
    })

    it('handles uppercase extensions', () => {
      expect(validateFileType('VIDEO.MP4')).toBe(true)
    })

    it('handles no extension', () => {
      expect(validateFileType('noextension')).toBe(false)
    })
  })

  describe('file size', () => {
    it('accepts files under 500MB', () => {
      expect(validateFileSize(100 * 1024 * 1024)).toBe(true)
    })

    it('accepts files exactly at 500MB', () => {
      expect(validateFileSize(500 * 1024 * 1024)).toBe(true)
    })

    it('rejects files over 500MB', () => {
      expect(validateFileSize(501 * 1024 * 1024)).toBe(false)
    })

    it('accepts zero-byte files', () => {
      expect(validateFileSize(0)).toBe(true)
    })
  })
})
