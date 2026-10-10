#include "confinement.hpp"
#include <winioctl.h>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <thread>
#include <atomic>
#include <set>
#include <random>
#include <chrono>

using namespace spike;
namespace fs=std::filesystem;
namespace {
std::string jsonQuote(const std::string& s) { std::string r="\""; for(unsigned char c:s){if(c=='"'||c=='\\'){r+='\\';r+=char(c);}else if(c>=32&&c<127)r+=char(c);else r+="?";}return r+'"'; }
void require(bool yes,const char* code) { if(!yes)throw Failure(code); }
struct Skip { std::string reason; };
// All adversarial mutation lives in this fixture broker, outside the read API.
struct Fixtures {
    fs::path base;
    Handle anchor;
    Fixtures() {
        wchar_t temp[32768]{}; require(GetTempPathW(32768,temp)>0,"TEMP_UNAVAILABLE");
        std::random_device rng;
        base=fs::path(temp)/(L"sekhem-isolation-"+std::to_wstring(rng())+L"-"+std::to_wstring(rng()));
        require(CreateDirectoryW(base.c_str(),nullptr)!=0,"FIXTURE_CREATE_FAILED");
        anchor=Handle(CreateFileW(base.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
            FILE_SHARE_READ, nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        require(bool(anchor),"FIXTURE_ANCHOR_FAILED");
        auto i=inspectHandle(anchor.value); require(i.standard.Directory && !(i.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT),"FIXTURE_ANCHOR_INVALID");
        validateVolume(anchor.value);
    }
    fs::path p(const std::wstring& relative) const {
        // Validate every computed mutation source/destination stays in the owned base.
        require(!relative.empty(),"FIXTURE_PATH_INVALID"); fs::path r(relative);
        require(!r.is_absolute()&&!r.has_root_name(),"FIXTURE_PATH_INVALID");
        for(const auto& part:r)require(part!=L".." && part!=L".","FIXTURE_PATH_INVALID");
        auto candidate=(base/r).lexically_normal(); auto rel=candidate.lexically_relative(base);
        require(!rel.empty() && *rel.begin()!=L"..","FIXTURE_PATH_INVALID"); return candidate;
    }
    void dir(const std::wstring& r) { require(CreateDirectoryW(p(r).c_str(),nullptr)!=0,"FIXTURE_DIRECTORY_FAILED"); }
    void file(const std::wstring& r,const std::string& text) {
        Handle h(CreateFileW(p(r).c_str(),GENERIC_WRITE,FILE_SHARE_READ,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr));
        require(bool(h),"FIXTURE_FILE_FAILED"); DWORD n=0; require(WriteFile(h.value,text.data(),static_cast<DWORD>(text.size()),&n,nullptr)&&n==text.size(),"FIXTURE_WRITE_FAILED");
    }
    bool move(const std::wstring& from,const std::wstring& to) { return MoveFileW(p(from).c_str(),p(to).c_str())!=0; }
    bool unlink(const std::wstring& r) { return DeleteFileW(p(r).c_str())!=0; }
    bool rmdir(const std::wstring& r) { return RemoveDirectoryW(p(r).c_str())!=0; } // never recursive
    bool hard(const std::wstring& link,const std::wstring& target) { return CreateHardLinkW(p(link).c_str(),p(target).c_str(),nullptr)!=0; }
    bool sym(const std::wstring& link,const std::wstring& target,bool directory) {
        return CreateSymbolicLinkW(p(link).c_str(),p(target).c_str(),(directory?1:0)|2)!=0;
    }
    bool junction(const std::wstring& name,const std::wstring& target) {
        auto link=p(name), dest=p(target); if(!CreateDirectoryW(link.c_str(),nullptr))return false;
        Handle h(CreateFileW(link.c_str(),GENERIC_WRITE,0,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        if(!h)return false;
        // Mount-point reparse buffer. Both substitute and print targets are fixtures.
        std::wstring substitute=L"\\??\\"+dest.wstring(), print=dest.wstring();
        const size_t bytes=16+(substitute.size()+1+print.size()+1)*sizeof(wchar_t);
        std::vector<unsigned char> b(bytes,0);
        auto put16=[&](size_t at,WORD v){memcpy(b.data()+at,&v,sizeof(v));};
        DWORD tag=IO_REPARSE_TAG_MOUNT_POINT; memcpy(b.data(),&tag,4);
        put16(4,static_cast<WORD>(bytes-8)); put16(8,0); put16(10,static_cast<WORD>(substitute.size()*2));
        put16(12,static_cast<WORD>((substitute.size()+1)*2)); put16(14,static_cast<WORD>(print.size()*2));
        memcpy(b.data()+16,substitute.c_str(),(substitute.size()+1)*2);
        memcpy(b.data()+16+(substitute.size()+1)*2,print.c_str(),(print.size()+1)*2);
        DWORD returned=0; return DeviceIoControl(h.value,FSCTL_SET_REPARSE_POINT,b.data(),static_cast<DWORD>(b.size()),nullptr,0,&returned,nullptr)!=0;
    }
    Identity id(const std::wstring& r) const {
        Handle h(CreateFileW(p(r).c_str(),FILE_READ_ATTRIBUTES,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        require(bool(h),"FIXTURE_INSPECTION_FAILED"); return inspectHandle(h.value).id;
    }
    std::string observe(const std::wstring& r) const noexcept { try{return id(r).text();}catch(...){return "unavailable";} }
};
struct Suite {
    int pass=0,fail=0,skip=0;
    std::ofstream cases,trace,observations;
    fs::path output;
    explicit Suite(const fs::path& folder):output(folder) {
        fs::create_directories(output);
        cases.open(output/L"tests.jsonl");trace.open(output/L"races.jsonl");observations.open(output/L"observations.jsonl");
        require(bool(cases)&&bool(trace)&&bool(observations),"REPORT_OPEN_FAILED");
    }
    void test(const std::string& name,const std::function<void()>& f) {
        std::string result="PASS",detail="OK";
        try{f();++pass;}catch(const Skip& s){++skip;result="SKIP";detail=s.reason;}
        catch(const std::exception& e){++fail;result="FAIL";detail=e.what();}
        cases<<"{\"test\":"<<jsonQuote(name)<<",\"result\":"<<jsonQuote(result)<<",\"detail\":"<<jsonQuote(detail)<<"}\n";
        std::cout<<result<<" "<<name<<" "<<detail<<"\n";
    }
    void obs(const std::string& name,const std::string& json) {observations<<"{\"observation\":"<<jsonQuote(name)<<","<<json<<"}\n";}
};
std::string data(const ReadResult& r){return std::string(r.bytes.begin(),r.bytes.end());}
void denied(const ReadResult& r,const std::string& code="") { require(r.status!="READ"&&r.bytes.empty(),"DENIAL_RETURNED_BYTES"); if(!code.empty())require(r.code==code,"UNEXPECTED_DENIAL_CODE"); }
void readOK(const ReadResult& r,const std::string& expected){require(r.status=="READ","READ_FAILED");require(data(r)==expected,"WRONG_BYTES");}
using NtSet=NTSTATUS(NTAPI*)(HANDLE,PIO_STATUS_BLOCK,PVOID,ULONG,FILE_INFORMATION_CLASS);
NTSTATUS linkThroughHandle(HANDLE source,const fs::path& destination) {
    // Adversary tests an already-open source handle, not only CreateHardLinkW.
    auto name=L"\\??\\"+destination.wstring();
    size_t off=offsetof(FILE_RENAME_INFO,FileName); // same aligned header layout as legacy FILE_LINK_INFORMATION
    std::vector<unsigned char> bytes(off+name.size()*sizeof(wchar_t),0);
    auto* info=reinterpret_cast<FILE_RENAME_INFO*>(bytes.data()); info->ReplaceIfExists=FALSE;info->RootDirectory=nullptr;info->FileNameLength=static_cast<DWORD>(name.size()*2);memcpy(info->FileName,name.data(),name.size()*2);
    auto set=reinterpret_cast<NtSet>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtSetInformationFile"));
    IO_STATUS_BLOCK io{};return set(source,&io,info,static_cast<ULONG>(bytes.size()),static_cast<FILE_INFORMATION_CLASS>(11));
}

} // fixture support copied for this independent experiment

