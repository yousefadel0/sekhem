#include "confinement.hpp"
#include <algorithm>
#include <sstream>
#include <iomanip>
#include <cwctype>

namespace spike {
namespace {
constexpr ULONG DontReparse=0x1000, CaseInsensitive=0x40;
constexpr ULONG OpenReparse=0x00200000, Synchronous=0x20;
using NtCreate = NTSTATUS (NTAPI*)(PHANDLE,ACCESS_MASK,POBJECT_ATTRIBUTES,PIO_STATUS_BLOCK,PLARGE_INTEGER,ULONG,ULONG,ULONG,ULONG,PVOID,ULONG);
using NtQuery = NTSTATUS (NTAPI*)(HANDLE,PIO_STATUS_BLOCK,PVOID,ULONG,FILE_INFORMATION_CLASS);
using NtError = ULONG (WINAPI*)(NTSTATUS);
NtCreate ntCreate() { static auto f=reinterpret_cast<NtCreate>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtCreateFile")); if(!f)throw Failure("UNSUPPORTED_ROOT"); return f; }
std::wstring lower(std::wstring s) { for(auto& c:s) c=static_cast<wchar_t>(towlower(c)); return s; }
bool equalName(const std::wstring& a,const std::wstring& b) { return CompareStringOrdinal(a.c_str(),static_cast<int>(a.size()),b.c_str(),static_cast<int>(b.size()),TRUE)==CSTR_EQUAL; }
std::wstring leaf(HANDLE h) { auto s=finalName(h); auto i=s.find_last_of(L'\\'); return s.substr(i==std::wstring::npos?0:i+1); }
void objectCheck(HANDLE h,bool directory,const Identity& volumeAnchor) {
    auto i=inspectHandle(h);
    if(i.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)throw Failure("REPARSE_POINT_DENIED");
    if(i.standard.DeletePending)throw Failure("OBJECT_CHANGED");
    if(i.id.volume!=volumeAnchor.volume)throw Failure("OUTSIDE_ROOT_DENIED");
    if(bool(i.standard.Directory)!=directory || GetFileType(h)!=FILE_TYPE_DISK)throw Failure("UNSUPPORTED_OBJECT");
    if(directory && i.caseFlags)throw Failure("UNSUPPORTED_ROOT");
    if(!directory && i.standard.NumberOfLinks!=1)throw Failure("HARD_LINK_POLICY_DENIED");
}
void namePolicy(HANDLE h,const std::wstring& requested) {
    auto actual=leaf(h);
    // Policy sees the kernel-reported long name, independently of containment.
    if(sensitiveName(actual))throw Failure("SENSITIVE_PATH_DENIED");
    if(!equalName(actual,requested))throw Failure("INVALID_RELATIVE_PATH"); // reject 8.3/other aliases, not expand them
}
}
bool Identity::operator==(const Identity& b) const { return volume==b.volume && memcmp(file.Identifier,b.file.Identifier,sizeof(file.Identifier))==0; }
std::string Identity::text() const {
    std::ostringstream o; o<<std::hex<<std::setfill('0')<<std::setw(16)<<volume<<":";
    for(auto b:file.Identifier)o<<std::setw(2)<<unsigned(b); return o.str();
}
Info inspectHandle(HANDLE h) {
    Info i; FILE_ID_INFO id{};
    if(!GetFileInformationByHandleEx(h,FileIdInfo,&id,sizeof(id)) ||
       !GetFileInformationByHandleEx(h,FileStandardInfo,&i.standard,sizeof(i.standard)) ||
       !GetFileInformationByHandleEx(h,FileAttributeTagInfo,&i.attributes,sizeof(i.attributes)) ||
       !GetFileInformationByHandleEx(h,FileBasicInfo,&i.basic,sizeof(i.basic)))throw Failure("UNSUPPORTED_OBJECT");
    i.id.volume=id.VolumeSerialNumber; i.id.file=id.FileId;
    if(i.standard.Directory && !(i.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT)) {
        // FileCaseSensitiveInformation = 71, supported Windows 10+ NT query.
        auto q=reinterpret_cast<NtQuery>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtQueryInformationFile"));
        IO_STATUS_BLOCK io{};
        if(!q || q(h,&io,&i.caseFlags,sizeof(i.caseFlags),static_cast<FILE_INFORMATION_CLASS>(71))<0)throw Failure("UNSUPPORTED_ROOT");
    }
    return i;
}
std::wstring finalName(HANDLE h) {
    std::vector<wchar_t> buf(32768);
    auto n=GetFinalPathNameByHandleW(h,buf.data(),static_cast<DWORD>(buf.size()),FILE_NAME_NORMALIZED|VOLUME_NAME_GUID);
    if(!n || n>=buf.size())throw Failure("UNSUPPORTED_OBJECT"); return std::wstring(buf.data(),n);
}
void validateVolume(HANDLE h) {
    wchar_t fs[64]{}; DWORD serial=0,maxComponent=0,flags=0;
    if(!GetVolumeInformationByHandleW(h,nullptr,0,&serial,&maxComponent,&flags,fs,64) || wcscmp(fs,L"NTFS")!=0)throw Failure("UNSUPPORTED_ROOT");
    auto path=finalName(h); const auto end=path.find(L"}\\");
    if(path.rfind(L"\\\\?\\Volume{",0)!=0 || end==std::wstring::npos)throw Failure("UNSUPPORTED_ROOT");
    auto volume=path.substr(0,end+2);
    if(GetDriveTypeW(volume.c_str())!=DRIVE_FIXED || path.size()<=volume.size())throw Failure("UNSUPPORTED_ROOT");
    if(!(flags&FILE_PERSISTENT_ACLS) || !(flags&FILE_SUPPORTS_HARD_LINKS))throw Failure("UNSUPPORTED_ROOT");
}
Handle nativeOpen(HANDLE parent,const std::wstring& component,ACCESS_MASK access,ULONG share,ULONG objectFlags,ULONG options,NTSTATUS* raw) {
    if(component.size()>32760)throw Failure("INVALID_RELATIVE_PATH");
    UNICODE_STRING name{}; name.Buffer=const_cast<PWSTR>(component.data()); name.Length=static_cast<USHORT>(component.size()*sizeof(wchar_t)); name.MaximumLength=name.Length;
    OBJECT_ATTRIBUTES oa{}; oa.Length=sizeof(oa); oa.RootDirectory=parent; oa.ObjectName=&name; oa.Attributes=objectFlags;
    IO_STATUS_BLOCK io{}; HANDLE h=INVALID_HANDLE_VALUE;
    NTSTATUS status=ntCreate()(&h,access,&oa,&io,nullptr,0,share,1,options,nullptr,0);
    if(raw)*raw=status;
    if(status<0) {
        if(status==static_cast<NTSTATUS>(0xC000050B) || status==static_cast<NTSTATUS>(0xC0000279))throw Failure("REPARSE_POINT_DENIED");
        auto map=reinterpret_cast<NtError>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"RtlNtStatusToDosError"));
        auto e=map?map(status):ERROR_GEN_FAILURE;
        if(e==ERROR_FILE_NOT_FOUND || e==ERROR_PATH_NOT_FOUND)throw Failure("NOT_FOUND");
        if(e==ERROR_SHARING_VIOLATION || e==ERROR_DELETE_PENDING)throw Failure("RACE_DETECTED");
        if(e==ERROR_ACCESS_DENIED)throw Failure("ACCESS_DENIED");
        throw Failure("UNSUPPORTED_OBJECT");
    }
    return Handle(h);
}
std::vector<std::wstring> validateRelative(const std::wstring& path) {
    if(path.empty() || path.size()>1024 || path.front()==L'/' || path.back()==L'/')throw Failure("INVALID_RELATIVE_PATH");
    for(size_t j=0;j<path.size();++j) {
        auto c=path[j];
        if(c<32 || (c>=127&&c<=159) || wcschr(L"\\:*?\"<>|",c) || (c>=0x200b&&c<=0x200f) ||
           (c>=0x202a&&c<=0x202e) || (c>=0x2060&&c<=0x206f) || c==0x2215 || c==0x2044 || c==0xff0f || c==0xff3c || c==0xff1a)throw Failure("INVALID_RELATIVE_PATH");
        if(c>=0xd800&&c<=0xdbff) { if(j+1>=path.size() || path[j+1]<0xdc00 || path[j+1]>0xdfff)throw Failure("INVALID_RELATIVE_PATH"); ++j; }
        else if(c>=0xdc00&&c<=0xdfff)throw Failure("INVALID_RELATIVE_PATH");
    }
    if(!IsNormalizedString(NormalizationC,path.data(),static_cast<int>(path.size())))throw Failure("INVALID_RELATIVE_PATH");
    std::vector<std::wstring> parts; size_t start=0;
    while(start<path.size()) {
        auto end=path.find(L'/',start); auto s=path.substr(start,end==std::wstring::npos?end:end-start);
        if(s.empty() || s.size()>255 || s==L"." || s==L".." || s.back()==L'.' || iswspace(s.back()) || iswspace(s.front()))throw Failure("INVALID_RELATIVE_PATH");
        auto base=lower(s.substr(0,s.find(L'.')));
        if(base==L"con"||base==L"prn"||base==L"aux"||base==L"nul"||base==L"conin$"||base==L"conout$"||base==L"clock$" ||
           (base.size()==4 && (base.substr(0,3)==L"com"||base.substr(0,3)==L"lpt") && ((base[3]>=L'0'&&base[3]<=L'9')||base[3]==0xb9||base[3]==0xb2||base[3]==0xb3)))throw Failure("INVALID_RELATIVE_PATH");
        parts.push_back(s); if(parts.size()>16)throw Failure("INVALID_RELATIVE_PATH");
        if(end==std::wstring::npos)break; start=end+1;
    }
    return parts;
}
bool sensitiveName(const std::wstring& s) {
    auto n=lower(s);
    static const std::vector<std::wstring> names={L".git",L"node_modules",L"dist",L"build",L"coverage",L".next",L"vendor",L"logs",L"tmp",L"target",L"venv",L".venv",L"__pycache__",L"storage",L"secrets",L"credentials",L".env",L"id_rsa",L"id_dsa",L"id_ed25519",L".netrc"};
    if(std::find(names.begin(),names.end(),n)!=names.end() || n.rfind(L".env.",0)==0)return true;
    for(auto token:{L"credentials",L"secrets",L"service-account",L"private-key",L"private_key"})if(n.find(token)!=std::wstring::npos)return true;
    auto dot=n.find_last_of(L'.'); auto ext=dot==std::wstring::npos?L"":n.substr(dot);
    for(auto e:{L".pem",L".key",L".p12",L".pfx",L".crt",L".cer",L".der"})if(ext==e)return true;
    return false;
}
Root::Root(HANDLE anchor,const std::wstring& relative) {
    auto parts=validateRelative(relative); HANDLE duplicate=nullptr;
    if(!DuplicateHandle(GetCurrentProcess(),anchor,GetCurrentProcess(),&duplicate,0,FALSE,DUPLICATE_SAME_ACCESS))throw Failure("INTERNAL_FAILURE");
    chain_.emplace_back(duplicate); auto anchorInfo=inspectHandle(anchor); validateVolume(anchor);
    if(!anchorInfo.standard.Directory || anchorInfo.caseFlags || (anchorInfo.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT))throw Failure("UNSUPPORTED_ROOT");
    for(const auto& p:parts) {
        auto h=nativeOpen(chain_.back().value,p,FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,CaseInsensitive|DontReparse,OpenReparse|Synchronous);
        objectCheck(h.value,true,anchorInfo.id); // Root names are selection, not content policy.
        if(!equalName(leaf(h.value),p))throw Failure("UNSUPPORTED_ROOT");
        chain_.push_back(std::move(h));
    }
    validateVolume(chain_.back().value); identity_=inspectHandle(chain_.back().value).id; name_=finalName(chain_.back().value);
}
ReadResult Root::readRelative(const std::wstring&,DWORD) const noexcept {
    ReadResult r; r.code="HARD_LINK_POLICY_UNPROVEN"; return r;
}
ReadResult Root::probeReadRelative(const std::wstring& path,DWORD maxBytes,const Hook& hook) const noexcept {
    ReadResult result;
    try {
        if(maxBytes==0 || maxBytes>MaxBytes)throw Failure("TOO_LARGE");
        auto parts=validateRelative(path);
        auto root=inspectHandle(chain_.back().value);
        if(!(root.id==identity_) || finalName(chain_.back().value)!=name_)throw Failure("ROOT_IDENTITY_CHANGED");
        for(const auto& h:chain_)objectCheck(h.value,true,identity_);
        std::vector<Handle> opened; HANDLE parent=chain_.back().value;
        for(size_t j=0;j<parts.size();++j) {
            if(sensitiveName(parts[j]))throw Failure("SENSITIVE_PATH_DENIED");
            if(hook)hook("before_component",parent);
            auto h=nativeOpen(parent,parts[j],FILE_READ_DATA|FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,CaseInsensitive|DontReparse,OpenReparse|Synchronous);
            auto info=inspectHandle(h.value);
            if(j+1==parts.size())result.identity=info.id;
            objectCheck(h.value,j+1<parts.size(),identity_); namePolicy(h.value,parts[j]);
            parent=h.value; opened.push_back(std::move(h));
            if(hook)hook("after_component",parent);
        }
        const auto before=inspectHandle(parent); result.identity=before.id; result.linksBefore=before.standard.NumberOfLinks;
        if(hook)hook("before_read",parent);
        objectCheck(parent,false,identity_);
        if(hook)hook("after_pre_read_check",parent);
        std::vector<unsigned char> bytes(maxBytes); DWORD count=0;
        if(!ReadFile(parent,bytes.data(),maxBytes,&count,nullptr))throw Failure("ACCESS_DENIED");
        if(hook)hook("after_read",parent);
        const auto after=inspectHandle(parent); result.linksAfter=after.standard.NumberOfLinks;
        objectCheck(parent,false,identity_);
        if(!(before.id==after.id) || before.standard.EndOfFile.QuadPart!=after.standard.EndOfFile.QuadPart ||
           before.basic.LastWriteTime.QuadPart!=after.basic.LastWriteTime.QuadPart || before.basic.ChangeTime.QuadPart!=after.basic.ChangeTime.QuadPart)throw Failure("OBJECT_CHANGED");
        if(finalName(chain_.back().value)!=name_)throw Failure("ROOT_IDENTITY_CHANGED");
        bytes.resize(count); result.bytes=std::move(bytes); result.truncated=before.standard.EndOfFile.QuadPart>count;
        result.status="READ"; result.code="OK";
    } catch(const Failure& f) { result.bytes.clear(); result.truncated=false; result.code=f.what(); }
      catch(...) { result.bytes.clear(); result.truncated=false; result.code="INTERNAL_FAILURE"; }
    return result;
}
}
