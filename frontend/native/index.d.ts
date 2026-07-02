/** Shared memory reader for MJPEG frame transport from Python backend. */
export class SharedMemoryReader {
  /** Open a file-backed mmap ring buffer at the given path. */
  constructor(path: string);

  /** Read the latest MJPEG frame from the ring buffer. Returns null if no frames written. */
  readLatestFrame(): Buffer | null;

  /** Get the current write index (number of frames written). Returns -1 if closed. */
  getWriteIndex(): number;

  /** Get ring buffer metadata (writeIndex, frameCount, slotSize, ringSize, width, height). */
  getMetadata(): {
    writeIndex: number;
    frameCount: number;
    slotSize: number;
    ringSize: number;
    width: number;
    height: number;
  };

  /** Close the mmap and file descriptor. */
  close(): void;
}
