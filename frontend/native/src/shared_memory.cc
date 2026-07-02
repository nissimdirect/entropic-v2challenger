/**
 * Shared Memory Reader — C++ native module for Entropic v2.
 *
 * Reads MJPEG frames from a file-backed mmap ring buffer written by
 * the Python backend (memory/writer.py).
 *
 * Header layout (64 bytes):
 *   offset 0:  write_index  (uint32_t)
 *   offset 4:  frame_count  (uint32_t)
 *   offset 8:  slot_size    (uint32_t)
 *   offset 12: ring_size    (uint32_t)
 *   offset 16: width        (uint32_t)
 *   offset 20: height       (uint32_t)
 *   offset 24: reserved     (40 bytes)
 *
 * Each slot (at HEADER_SIZE + slot_index * slot_size):
 *   offset 0: length (uint32_t) — MJPEG byte count
 *   offset 4: MJPEG data (length bytes)
 */

#include <napi.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <cstring>

static constexpr uint32_t HEADER_SIZE = 64;

struct ShmHeader {
    uint32_t write_index;
    uint32_t frame_count;
    uint32_t slot_size;
    uint32_t ring_size;
    uint32_t width;
    uint32_t height;
};

class SharedMemoryReader : public Napi::ObjectWrap<SharedMemoryReader> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "SharedMemoryReader", {
            InstanceMethod("readLatestFrame", &SharedMemoryReader::ReadLatestFrame),
            InstanceMethod("getWriteIndex", &SharedMemoryReader::GetWriteIndex),
            InstanceMethod("getMetadata", &SharedMemoryReader::GetMetadata),
            InstanceMethod("close", &SharedMemoryReader::Close),
        });
        exports.Set("SharedMemoryReader", func);
        return exports;
    }

    SharedMemoryReader(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<SharedMemoryReader>(info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Expected string path argument")
                .ThrowAsJavaScriptException();
            return;
        }

        path_ = info[0].As<Napi::String>().Utf8Value();

        // Open the file
        fd_ = ::open(path_.c_str(), O_RDONLY);
        if (fd_ < 0) {
            Napi::Error::New(env, "Failed to open shared memory file: " + path_)
                .ThrowAsJavaScriptException();
            return;
        }

        // Get file size
        struct stat st;
        if (fstat(fd_, &st) != 0 || st.st_size < static_cast<off_t>(HEADER_SIZE)) {
            ::close(fd_);
            fd_ = -1;
            Napi::Error::New(env, "Shared memory file too small or stat failed")
                .ThrowAsJavaScriptException();
            return;
        }
        file_size_ = static_cast<size_t>(st.st_size);

        // mmap the file (read-only)
        buf_ = static_cast<uint8_t*>(
            mmap(nullptr, file_size_, PROT_READ, MAP_SHARED, fd_, 0));
        if (buf_ == MAP_FAILED) {
            buf_ = nullptr;
            ::close(fd_);
            fd_ = -1;
            Napi::Error::New(env, "mmap failed for shared memory file")
                .ThrowAsJavaScriptException();
            return;
        }
    }

    ~SharedMemoryReader() {
        DoClose();
    }

private:
    std::string path_;
    int fd_ = -1;
    uint8_t* buf_ = nullptr;
    size_t file_size_ = 0;

    const ShmHeader* Header() const {
        return reinterpret_cast<const ShmHeader*>(buf_);
    }

    void DoClose() {
        if (buf_ != nullptr) {
            munmap(buf_, file_size_);
            buf_ = nullptr;
        }
        if (fd_ >= 0) {
            ::close(fd_);
            fd_ = -1;
        }
    }

    Napi::Value ReadLatestFrame(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (buf_ == nullptr) {
            Napi::Error::New(env, "SharedMemoryReader is closed")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        const ShmHeader* hdr = Header();
        uint32_t write_idx = hdr->write_index;
        uint32_t ring_size = hdr->ring_size;
        uint32_t slot_size = hdr->slot_size;

        if (write_idx == 0) {
            // No frames written yet
            return env.Null();
        }

        // Latest frame is at (write_index - 1) % ring_size
        uint32_t slot = (write_idx - 1) % ring_size;
        size_t offset = HEADER_SIZE + (static_cast<size_t>(slot) * slot_size);

        // Read length prefix (first 4 bytes of slot)
        if (offset + 4 > file_size_) {
            Napi::Error::New(env, "Slot offset exceeds file size")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        uint32_t length;
        std::memcpy(&length, buf_ + offset, sizeof(uint32_t));

        if (length == 0 || offset + 4 + length > file_size_) {
            return env.Null();
        }

        // Copy MJPEG bytes into a Node.js Buffer
        return Napi::Buffer<uint8_t>::Copy(env, buf_ + offset + 4, length);
    }

    Napi::Value GetWriteIndex(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (buf_ == nullptr) {
            return Napi::Number::New(env, -1);
        }

        return Napi::Number::New(env, Header()->write_index);
    }

    Napi::Value GetMetadata(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (buf_ == nullptr) {
            Napi::Error::New(env, "SharedMemoryReader is closed")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        const ShmHeader* hdr = Header();
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("writeIndex", Napi::Number::New(env, hdr->write_index));
        obj.Set("frameCount", Napi::Number::New(env, hdr->frame_count));
        obj.Set("slotSize", Napi::Number::New(env, hdr->slot_size));
        obj.Set("ringSize", Napi::Number::New(env, hdr->ring_size));
        obj.Set("width", Napi::Number::New(env, hdr->width));
        obj.Set("height", Napi::Number::New(env, hdr->height));
        return obj;
    }

    Napi::Value Close(const Napi::CallbackInfo& info) {
        DoClose();
        return info.Env().Undefined();
    }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return SharedMemoryReader::Init(env, exports);
}

NODE_API_MODULE(shared_memory, Init)
