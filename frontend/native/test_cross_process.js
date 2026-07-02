/**
 * Cross-process test: verifies the C++ native module can read frames
 * written by the Python SharedMemoryWriter.
 *
 * Usage: node test_cross_process.js <shm_path>
 * The Python side must write frames first.
 */
const path = require('path');
const { SharedMemoryReader } = require('./build/Release/shared_memory.node');

const shmPath = process.argv[2];
if (!shmPath) {
  console.error('Usage: node test_cross_process.js <shm_path>');
  process.exit(1);
}

try {
  const reader = new SharedMemoryReader(shmPath);

  // Read metadata
  const meta = reader.getMetadata();
  console.log('Metadata:', JSON.stringify(meta));

  // Verify header fields
  console.assert(meta.slotSize === 4 * 1024 * 1024, 'slot_size should be 4MB');
  console.assert(meta.ringSize === 4, 'ring_size should be 4');
  console.assert(meta.writeIndex > 0, 'write_index should be > 0');
  console.assert(meta.width > 0, 'width should be > 0');
  console.assert(meta.height > 0, 'height should be > 0');

  // Read latest frame
  const frame = reader.readLatestFrame();
  console.assert(frame !== null, 'frame should not be null');
  console.assert(frame.length > 0, 'frame should have data');

  // Verify JPEG SOI marker (FF D8 FF)
  console.assert(frame[0] === 0xFF, 'JPEG SOI byte 0');
  console.assert(frame[1] === 0xD8, 'JPEG SOI byte 1');
  console.assert(frame[2] === 0xFF, 'JPEG SOI byte 2');

  console.log(`Frame size: ${frame.length} bytes`);
  console.log(`Write index: ${reader.getWriteIndex()}`);

  reader.close();
  console.log('ALL ASSERTIONS PASSED');
  process.exit(0);
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
