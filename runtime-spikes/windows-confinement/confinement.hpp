#pragma once
#include <windows.h>
#include <winternl.h>
#include <string>
#include <vector>
#include <functional>
#include <stdexcept>

namespace spike {
struct Handle {
    HANDLE value = INVALID_HANDLE_VALUE;
    Handle() = default;
    explicit Handle(HANDLE h) : value(h) {}
    ~Handle() { reset(); }
    Handle(const Handle&) = delete;
    Handle& operator=(const Handle&) = delete;
    Handle(Handle&& h) noexcept : value(h.value) { h.value = INVALID_HANDLE_VALUE; }
    Handle& operator=(Handle&& h) noexcept { if (this != &h) { reset(); value=h.value; h.value=INVALID_HANDLE_VALUE; } return *this; }
    void reset() { if (value != INVALID_HANDLE_VALUE && value != nullptr) CloseHandle(value); value=INVALID_HANDLE_VALUE; }
    explicit operator bool() const { return value != INVALID_HANDLE_VALUE && value != nullptr; }
};
struct Failure : std::runtime_error { explicit Failure(const char* c) : std::runtime_error(c) {} };
struct Identity {
    ULONGLONG volume = 0;
    FILE_ID_128 file{};
    bool operator==(const Identity& b) const;
    std::string text() const;
};
struct Info {
    Identity id;
    FILE_STANDARD_INFO standard{};
    FILE_ATTRIBUTE_TAG_INFO attributes{};
    FILE_BASIC_INFO basic{};
    ULONG caseFlags = 0;
};
struct ReadResult {
    std::string status = "DENIED", code;
    std::vector<unsigned char> bytes;
    bool truncated = false;
    Identity identity;
    DWORD linksBefore = 0, linksAfter = 0;
};
// Experiment instrumentation is synchronous, test-only, and never serialized.
using Hook = std::function<void(const char*, HANDLE)>;
Info inspectHandle(HANDLE h);
std::wstring finalName(HANDLE h); // internal observation; never normal response data
Handle nativeOpen(HANDLE parent, const std::wstring& component, ACCESS_MASK access,
                  ULONG share, ULONG objectFlags, ULONG options, NTSTATUS* raw = nullptr);
std::vector<std::wstring> validateRelative(const std::wstring& path);
bool sensitiveName(const std::wstring& component);
void validateVolume(HANDLE directory);
class Root {
    std::vector<Handle> chain_;
    Identity identity_;
    std::wstring name_;
public:
    static constexpr DWORD MaxBytes = 4096;
    // anchor is the harness-created disposable directory, never backend request input.
    Root(HANDLE fixtureAnchor, const std::wstring& selectedRelativeDirectory);
    Root(const Root&) = delete;
    Root& operator=(const Root&) = delete;
    Identity identity() const { return identity_; }
    HANDLE handleForTest() const { return chain_.back().value; }
    // Normal entry point is quarantined after the hard-link hypothesis failed.
    ReadResult readRelative(const std::wstring& path, DWORD maxBytes) const noexcept;
    // Deliberately unsafe experimental path: only the disposable adversarial harness.
    // Kept to reproduce the failed hypothesis, not a Runtime implementation.
    ReadResult probeReadRelative(const std::wstring& path, DWORD maxBytes, const Hook& hook = {}) const noexcept;
};
}
