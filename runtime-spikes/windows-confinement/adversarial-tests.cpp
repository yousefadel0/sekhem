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
        base=fs::path(temp)/(L"sekhem-confinement-"+std::to_wstring(rng())+L"-"+std::to_wstring(rng()));
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
void runRace(Suite& s,Fixtures& f,Root& root,const std::string& name,const std::wstring& relative,
             int iterations,const std::set<std::string>& allowed,const std::function<void(std::atomic<int>&)>& attack) {
    std::atomic<bool> stop{false};std::atomic<int> attempts{0},changes{0};
    std::thread adversary([&]{while(!stop.load()){++attempts;attack(changes);std::this_thread::yield();}});
    int reads=0,denials=0,escapes=0;
    for(int i=0;i<iterations;++i){
        auto before=f.observe(L"root/"+relative);
        auto r=root.probeReadRelative(relative,64,[](const char* stage,HANDLE){if(std::string(stage)=="before_read")std::this_thread::yield();});
        bool escape=r.status=="READ" && (!allowed.count(r.identity.text()) || data(r).find("OUTSIDE")!=std::string::npos);
        if(r.status=="READ")++reads;else ++denials;if(escape)++escapes;
        s.trace<<"{\"operation\":"<<jsonQuote(name)<<",\"iteration\":"<<i<<",\"identityBefore\":"<<jsonQuote(before)
          <<",\"identityOpened\":"<<jsonQuote(r.identity.text())<<",\"result\":"<<jsonQuote(r.code)<<",\"escape\":"<<(escape?"true":"false")
          <<",\"failedClosed\":"<<(r.status=="READ"?"false":"true")<<"}\n";
    }
    stop=true;adversary.join();
    s.obs(name,"\"iterations\":"+std::to_string(iterations)+",\"attempts\":"+std::to_string(attempts)+",\"successfulChanges\":"+std::to_string(changes)+",\"reads\":"+std::to_string(reads)+",\"safeDenials\":"+std::to_string(denials)+",\"escapes\":"+std::to_string(escapes));
    require(attempts>0,"RACE_NOT_EXERCISED");require(escapes==0,"CRITICAL_ESCAPE");require(changes>0,"RACE_NO_SUCCESSFUL_ADVERSARIAL_CHANGES");
}
}

int wmain(int argc,wchar_t** argv) {
    // Deliberately no arbitrary-root or tool-execution command line.
    int iterations=2000;
    if(argc>2)return 2;
    if(argc==2){wchar_t* end=nullptr;long n=wcstol(argv[1],&end,10);if(!end||*end||n<100||n>100000)return 2;iterations=static_cast<int>(n);}
    try {
        auto output=fs::current_path()/L"evidence"/(L"run-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));
        Suite s(output);Fixtures f;
        // Fixture path is harness-only provenance, never a native read result.
        std::ofstream manifest(output/L"fixture-location.txt");manifest<<f.base.string()<<"\n";manifest.close();
        f.dir(L"root");f.dir(L"outside");f.file(L"outside/sentinel.txt","OUTSIDE_FIXTURE_SENTINEL");
        f.file(L"root/hello.txt","SAFE_HELLO");f.dir(L"root/sub");f.file(L"root/sub/child.txt","SAFE_NESTED");
        f.file(L"root/large.txt",std::string(6000,'x'));f.file(L"root/empty.txt","");
        Root root(f.anchor.value,L"root");
        s.test("GATE normal API fails closed after disproven hypothesis",[&]{denied(root.readRelative(L"hello.txt",64),"HARD_LINK_POLICY_UNPROVEN");});
        s.obs("root","\"identity\":"+jsonQuote(root.identity().text())+",\"fileSystem\":\"NTFS\",\"driveType\":\"FIXED\",\"directory\":true,\"reparse\":false,\"caseSensitive\":false");
        s.test("A ordinary bounded read",[&]{readOK(root.probeReadRelative(L"hello.txt",64),"SAFE_HELLO");});
        s.test("B nested read",[&]{readOK(root.probeReadRelative(L"sub/child.txt",64),"SAFE_NESTED");});
        s.test("A case insensitive lookup",[&]{readOK(root.probeReadRelative(L"HeLLo.TxT",64),"SAFE_HELLO");});
        s.test("A empty file",[&]{readOK(root.probeReadRelative(L"empty.txt",64),"");});
        s.test("B directory cannot be read as file",[&]{denied(root.probeReadRelative(L"sub",64),"UNSUPPORTED_OBJECT");});
        s.test("T truncation",[&]{auto r=root.probeReadRelative(L"large.txt",32);readOK(r,std::string(32,'x'));require(r.truncated,"TRUNCATION_MISSING");});
        s.test("T maximum bound",[&]{auto r=root.probeReadRelative(L"large.txt",4096);require(r.bytes.size()==4096&&r.truncated,"BOUND_FAILED");});
        s.test("T invalid zero limit",[&]{denied(root.probeReadRelative(L"hello.txt",0),"TOO_LARGE");});
        s.test("T excessive limit",[&]{denied(root.probeReadRelative(L"hello.txt",4097),"TOO_LARGE");});
        s.test("U not found distinct",[&]{denied(root.probeReadRelative(L"absent.txt",64),"NOT_FOUND");});
        const std::vector<std::pair<std::string,std::wstring>> invalid={
            {"C parent",L"../outside/sentinel.txt"},{"C nested parent",L"sub/../../outside/sentinel.txt"},{"C dot",L"./hello.txt"},
            {"C empty component",L"sub//child.txt"},{"C trailing separator",L"sub/"},{"C empty",L""},
            {"D absolute",L"/hello.txt"},{"D drive qualified",L"C:/hello.txt"},{"D drive relative",L"C:hello.txt"},
            {"E UNC",L"//server/share/file"},{"E DOS device",L"\\\\.\\NUL"},{"E NT device",L"\\Device\\HarddiskVolume1\\file"},
            {"E GLOBALROOT",L"\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\file"},{"E extended path",L"\\\\?\\C:\\file"},
            {"F ADS",L"hello.txt:secret"},{"F default stream",L"hello.txt::$DATA"},{"F colon",L"sub:a/file"},
            {"G CON",L"CON"},{"G reserved extension",L"nul.txt"},{"G COM1",L"COM1.txt"},{"G LPT9",L"lpt9"},{"G console",L"CONIN$"},{"G superscript",L"COM\u00b9"},
            {"H trailing dot",L"hello.txt."},{"H trailing space",L"hello.txt "},{"H leading space",L" hello.txt"},
            {"I backslash",L"sub\\child.txt"},{"I mixed slash",L"sub\\/child.txt"},{"I decomposed NFC",L"cafe\u0301.txt"},
            {"I bidi",L"a\u202etxt"},{"I slash confusable",L"sub\u2215child.txt"},{"I wildcard",L"*.txt"},
            {"I embedded NUL",std::wstring(L"hello\0.txt",10)},{"I unpaired high",std::wstring(1,wchar_t(0xd800))},{"I unpaired low",std::wstring(1,wchar_t(0xdc00))},
            {"I excessive path",std::wstring(1025,L'x')}
        };
        for(const auto& p:invalid)s.test(p.first,[&]{denied(root.probeReadRelative(p.second,32),"INVALID_RELATIVE_PATH");});
        f.file(L"root/caf\u00e9.txt","SAFE_UNICODE");
        s.test("I NFC Unicode",[&]{readOK(root.probeReadRelative(L"caf\u00e9.txt",32),"SAFE_UNICODE");});
        f.file(L"root/.env","DUMMY_SENSITIVE_FIXTURE");f.dir(L"root/credentials");f.file(L"root/credentials/plain.txt","DUMMY");f.file(L"root/id_rsa","DUMMY");
        f.file(L"root/service-account.json","DUMMY");f.file(L"root/server.pem","DUMMY");
        int sensitiveCase=0;
        for(auto p:{L".env",L".ENV",L"credentials/plain.txt",L"id_rsa",L"service-account.json",L"server.pem",L".git/config"})
            s.test("POLICY sensitive case "+std::to_string(++sensitiveCase),[&]{denied(root.probeReadRelative(p,32),"SENSITIVE_PATH_DENIED");});
        s.test("POLICY confined object is not authorized",[&]{auto h=nativeOpen(root.handleForTest(),L".env",FILE_READ_ATTRIBUTES|SYNCHRONIZE,FILE_SHARE_READ,0x1040,0x200020);require(inspectHandle(h.value).id.volume==root.identity().volume,"NOT_CONFINED");denied(root.probeReadRelative(L".env",32),"SENSITIVE_PATH_DENIED");});
        const bool junctionIn=f.junction(L"root/j-in",L"root/sub"),junctionOut=f.junction(L"root/j-out",L"outside");
        s.test("K junction inside rejected",[&]{if(!junctionIn)throw Skip{"JUNCTION_CREATION_UNAVAILABLE"};denied(root.probeReadRelative(L"j-in/child.txt",32),"REPARSE_POINT_DENIED");});
        s.test("K junction escape rejected",[&]{if(!junctionOut)throw Skip{"JUNCTION_CREATION_UNAVAILABLE"};denied(root.probeReadRelative(L"j-out/sentinel.txt",32),"REPARSE_POINT_DENIED");});
        s.test("L nested reparse rejected",[&]{require(f.junction(L"root/sub/nested",L"outside"),"JUNCTION_CREATE_FAILED");denied(root.probeReadRelative(L"sub/nested/sentinel.txt",32),"REPARSE_POINT_DENIED");});
        s.test("M reparse root rejected",[&]{require(f.junction(L"root-link",L"root"),"JUNCTION_CREATE_FAILED");try{Root r(f.anchor.value,L"root-link");throw Failure("ROOT_REPARSE_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="REPARSE_POINT_DENIED","ROOT_REPARSE_WRONG_ERROR");}});
        s.test("M intermediate registration reparse",[&]{try{Root r(f.anchor.value,L"root-link/sub");throw Failure("ROOT_REPARSE_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="REPARSE_POINT_DENIED","ROOT_REPARSE_WRONG_ERROR");}});
        const bool symlink=f.sym(L"root/s-in",L"root/hello.txt",false); DWORD symError=symlink?0:GetLastError();
        s.obs("symlinkPrivilege","\"available\":"+std::string(symlink?"true":"false")+",\"win32Error\":"+std::to_string(symError));
        s.test("J file symlink inside",[&]{if(!symlink)throw Skip{"SYMLINK_PRIVILEGE_UNAVAILABLE"};denied(root.probeReadRelative(L"s-in",32),"REPARSE_POINT_DENIED");});
        s.test("J file symlink escape",[&]{if(!symlink)throw Skip{"SYMLINK_PRIVILEGE_UNAVAILABLE"};require(f.sym(L"root/s-out",L"outside/sentinel.txt",false),"SYMLINK_CREATE_FAILED");denied(root.probeReadRelative(L"s-out",32),"REPARSE_POINT_DENIED");});
        s.test("J directory symlink",[&]{if(!symlink)throw Skip{"SYMLINK_PRIVILEGE_UNAVAILABLE"};require(f.sym(L"root/s-dir",L"outside",true),"SYMLINK_CREATE_FAILED");denied(root.probeReadRelative(L"s-dir/sentinel.txt",32),"REPARSE_POINT_DENIED");});
        // Inspect exact flag behavior with metadata-only negative controls. Never read sentinel bytes.
        for(int mode=0;mode<4;++mode)s.test("API NtCreateFile flags "+std::to_string(mode),[&]{
            if(!junctionOut)throw Skip{"JUNCTION_CREATION_UNAVAILABLE"};NTSTATUS raw=0;
            bool opened=false,reparse=false,outside=false;std::string code="OK";
            try{auto h=nativeOpen(root.handleForTest(),L"j-out",FILE_READ_ATTRIBUTES|SYNCHRONIZE,7,0x40|(mode&1?0x1000:0),0x20|(mode&2?0x200000:0),&raw);
                opened=true;auto info=inspectHandle(h.value);reparse=bool(info.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT);outside=info.id==f.id(L"outside");}
            catch(const Failure& e){code=e.what();}
            s.obs("nativeFlags"+std::to_string(mode),"\"opened\":"+std::string(opened?"true":"false")+",\"reparseObject\":"+(reparse?"true":"false")+",\"outsideObject\":"+(outside?"true":"false")+",\"ntstatus\":"+std::to_string(static_cast<unsigned long>(raw))+",\"code\":"+jsonQuote(code));
            if(mode==0)require(opened&&outside,"NEGATIVE_CONTROL_DID_NOT_FOLLOW");else require(!outside,"NATIVE_FLAG_FOLLOWED_REPARSE");
        });
        f.file(L"root/hard.txt","SAFE_HARD");
        s.test("N existing outside hard link denied",[&]{require(f.hard(L"outside/hard-alias",L"root/hard.txt"),"HARDLINK_CREATE_FAILED");denied(root.probeReadRelative(L"hard.txt",32),"HARD_LINK_POLICY_DENIED");require(f.unlink(L"outside/hard-alias"),"HARDLINK_REMOVE_FAILED");});
        s.test("N existing inside hard link denied",[&]{require(f.hard(L"root/sub/hard-alias",L"root/hard.txt"),"HARDLINK_CREATE_FAILED");denied(root.probeReadRelative(L"hard.txt",32),"HARD_LINK_POLICY_DENIED");require(f.unlink(L"root/sub/hard-alias"),"HARDLINK_REMOVE_FAILED");});
        s.test("O hard link creation during held read",[&]{bool tried=false,created=false;DWORD error=0;
            auto r=root.probeReadRelative(L"hard.txt",32,[&](const char* stage,HANDLE){if(std::string(stage)=="before_read"){tried=true;created=f.hard(L"outside/held-alias",L"root/hard.txt");error=created?0:GetLastError();}});
            s.obs("heldHardLink","\"created\":"+std::string(created?"true":"false")+",\"win32Error\":"+std::to_string(error)+",\"readCode\":"+jsonQuote(r.code));
            if(created)f.unlink(L"outside/held-alias");require(tried&&!created,"HARDLINK_CREATED_DURING_HELD_READ");readOK(r,"SAFE_HARD");});
        s.test("O preopened read-only handle cannot add link",[&]{
            Handle attacker(CreateFileW(f.p(L"root/hard.txt").c_str(),FILE_READ_ATTRIBUTES|SYNCHRONIZE,7,nullptr,OPEN_EXISTING,0,nullptr));require(bool(attacker),"ATTACKER_OPEN_FAILED");NTSTATUS st=0;
            auto r=root.probeReadRelative(L"hard.txt",32,[&](const char* stage,HANDLE){if(std::string(stage)=="before_read")st=linkThroughHandle(attacker.value,f.p(L"outside/native-alias"));});
            bool sameObject=st>=0&&f.id(L"outside/native-alias")==f.id(L"root/hard.txt");
            if(st>=0)f.unlink(L"outside/native-alias");s.obs("preopenedLink","\"ntstatus\":"+std::to_string(static_cast<unsigned long>(st))+",\"sameObjectAlias\":"+(sameObject?"true":"false")+",\"readCode\":"+jsonQuote(r.code));require(st<0,"PREOPENED_LINK_BYPASS");readOK(r,"SAFE_HARD");});
        s.test("O preopened mutating handle denies reader",[&]{
            Handle attacker(CreateFileW(f.p(L"root/hard.txt").c_str(),DELETE|FILE_WRITE_ATTRIBUTES|SYNCHRONIZE,7,nullptr,OPEN_EXISTING,0,nullptr));require(bool(attacker),"ATTACKER_OPEN_FAILED");denied(root.probeReadRelative(L"hard.txt",32),"RACE_DETECTED");});
        s.test("O hard-link ABA spans actual read",[&]{int exercised=0,released=0,closed=0;
            const int abaIterations=1000;
            for(int i=0;i<abaIterations;++i){bool made=false,removed=false,aliasObserved=false;Identity actual{};
                auto before=f.id(L"root/hard.txt");
                auto r=root.probeReadRelative(L"hard.txt",32,[&](const char* stage,HANDLE h){
                    if(std::string(stage)=="after_pre_read_check"){made=f.hard(L"outside/aba-alias",L"root/hard.txt");actual=inspectHandle(h).id;aliasObserved=made&&f.id(L"outside/aba-alias")==actual;}
                    if(std::string(stage)=="after_read"&&made)removed=f.unlink(L"outside/aba-alias");});
                if(made&&removed&&aliasObserved)++exercised;
                const bool breach=made&&removed&&aliasObserved&&r.status=="READ";
                if(breach)++released;else if(r.status!="READ")++closed;
                s.trace<<"{\"operation\":\"hard-link-ABA\",\"iteration\":"<<i<<",\"identityBefore\":"<<jsonQuote(before.text())<<",\"identityOpened\":"<<jsonQuote(actual.text())
                  <<",\"result\":"<<jsonQuote(r.code)<<",\"escape\":false,\"hardLinkPolicyBreach\":"<<(breach?"true":"false")<<",\"outsideAliasObservedDuringRead\":"<<(aliasObserved?"true":"false")
                  <<",\"bytesReleased\":"<<r.bytes.size()<<",\"failedClosed\":"<<(r.status!="READ"?"true":"false")<<"}\n";
            }
            s.obs("hardLinkABA","\"iterations\":"+std::to_string(abaIterations)+",\"exercised\":"+std::to_string(exercised)+",\"bytesReleasingReads\":"+std::to_string(released)+",\"safeDenials\":"+std::to_string(closed));
            require(exercised==abaIterations,"ABA_NOT_FULLY_EXERCISED");require(released==0,"CRITICAL_HARDLINK_ABA_BYTES_RELEASED");});
        s.test("OBS rename API baseline under retained root",[&]{f.file(L"root/rename-probe.txt","SAFE");bool moved=f.move(L"root/rename-probe.txt",L"outside/rename-probe.txt");DWORD outError=moved?0:GetLastError();bool back=moved&&f.move(L"outside/rename-probe.txt",L"root/rename-probe.txt");DWORD inError=back?0:GetLastError();s.obs("renameProbe","\"movedOut\":"+std::string(moved?"true":"false")+",\"outError\":"+std::to_string(outError)+",\"movedIn\":"+(back?"true":"false")+",\"inError\":"+std::to_string(inError));});
        s.test("P target rename during held read",[&]{bool moved=false;auto r=root.probeReadRelative(L"hello.txt",32,[&](const char* stage,HANDLE){if(std::string(stage)=="before_read")moved=f.move(L"root/hello.txt",L"outside/renamed.txt");});if(moved)f.move(L"outside/renamed.txt",L"root/hello.txt");require(!moved,"HELD_TARGET_RENAMED");readOK(r,"SAFE_HELLO");});
        s.test("P parent move during held read",[&]{bool moved=false;auto r=root.probeReadRelative(L"sub/child.txt",32,[&](const char* stage,HANDLE){if(std::string(stage)=="before_read")moved=f.move(L"root/sub",L"outside/moved-sub");});if(moved)f.move(L"outside/moved-sub",L"root/sub");require(!moved,"HELD_PARENT_MOVED");readOK(r,"SAFE_NESTED");});
        s.test("Q target replacement during held read",[&]{bool removed=false;auto r=root.probeReadRelative(L"hello.txt",32,[&](const char* stage,HANDLE){if(std::string(stage)=="before_read")removed=f.unlink(L"root/hello.txt");});require(!removed,"HELD_TARGET_REMOVED");readOK(r,"SAFE_HELLO");});
        s.test("R reparse introduced after input validation",[&]{bool done=false;auto r=root.probeReadRelative(L"late/sentinel.txt",32,[&](const char* stage,HANDLE){if(!done&&std::string(stage)=="before_component"){done=true;require(f.junction(L"root/late",L"outside"),"JUNCTION_CREATE_FAILED");}});denied(r,"REPARSE_POINT_DENIED");});
        s.test("S root replacement denied while registered",[&]{require(!f.move(L"root",L"retired-root"),"REGISTERED_ROOT_MOVED");readOK(root.probeReadRelative(L"hello.txt",32),"SAFE_HELLO");});
        s.test("S registration changes object identity",[&]{f.dir(L"registration");f.dir(L"registration/replaceable");Identity old;{Root r(f.anchor.value,L"registration/replaceable");old=r.identity();}require(f.move(L"registration/replaceable",L"registration/old-object"),"REPLACEABLE_MOVE_FAILED");f.dir(L"registration/replaceable");Root newer(f.anchor.value,L"registration/replaceable");require(!(old==newer.identity()),"REPLACEMENT_IDENTITY_NOT_CHANGED");});
        s.test("U sanitized errors",[&]{for(const auto& p:invalid){auto r=root.probeReadRelative(p.second,32);require(r.code.find(':')==std::string::npos&&r.code.find('\\')==std::string::npos&&r.code.find('/')==std::string::npos&&r.bytes.empty(),"ERROR_LEAK");}});
        s.test("I short-name alias policy",[&]{f.file(L"root/credentials-long-name.txt","DUMMY");wchar_t shortName[32768]{};auto full=f.p(L"root/credentials-long-name.txt");auto n=GetShortPathNameW(full.c_str(),shortName,32768);if(!n)throw Skip{"SHORT_NAMES_UNAVAILABLE"};auto alias=fs::path(shortName).filename().wstring();if(alias==full.filename().wstring())throw Skip{"NO_8DOT3_ALIAS_ON_VOLUME"};auto r=root.probeReadRelative(alias,32);s.obs("shortNamePolicy","\"aliasAvailable\":true,\"code\":"+jsonQuote(r.code));denied(r);require(r.code=="SENSITIVE_PATH_DENIED"||r.code=="INVALID_RELATIVE_PATH","SHORT_NAME_POLICY_BYPASS");});
        s.test("X volume root rejected",[&]{Handle h(CreateFileW(f.base.root_path().c_str(),FILE_READ_ATTRIBUTES,7,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS,nullptr));require(bool(h),"VOLUME_OPEN_FAILED");try{validateVolume(h.value);throw Failure("VOLUME_ROOT_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="UNSUPPORTED_ROOT","WRONG_VOLUME_ERROR");}});
        s.test("X UNC rejected before network access",[&]{try{Root r(f.anchor.value,L"//nonexistent/share");throw Failure("UNC_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="INVALID_RELATIVE_PATH","WRONG_UNC_ERROR");}});
        s.test("X file root rejected",[&]{try{Root r(f.anchor.value,L"root/hello.txt");throw Failure("FILE_ROOT_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="UNSUPPORTED_OBJECT","WRONG_FILE_ROOT_ERROR");}});
        s.test("X case-sensitive directory detection",[&]{
            f.dir(L"case-sensitive");Handle h(CreateFileW(f.p(L"case-sensitive").c_str(),FILE_READ_ATTRIBUTES|FILE_WRITE_ATTRIBUTES,7,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS,nullptr));require(bool(h),"CASE_HANDLE_FAILED");
            ULONG flags=1;IO_STATUS_BLOCK io{};auto set=reinterpret_cast<NtSet>(GetProcAddress(GetModuleHandleW(L"ntdll.dll"),"NtSetInformationFile"));auto st=set(h.value,&io,&flags,sizeof(flags),static_cast<FILE_INFORMATION_CLASS>(71));h.reset();
            s.obs("caseSensitiveSetup","\"ntstatus\":"+std::to_string(static_cast<unsigned long>(st)));if(st<0)throw Skip{"CASE_SENSITIVE_MODE_CREATION_UNAVAILABLE"};
            try{Root r(f.anchor.value,L"case-sensitive");throw Failure("CASE_SENSITIVE_ACCEPTED");}catch(const Failure& e){require(std::string(e.what())=="UNSUPPORTED_ROOT","WRONG_CASE_ERROR");}
        });
        for(auto unavailable:{"ReFS","FAT/exFAT","removable","network share integration"})s.test(std::string("X environment ")+unavailable,[&]{throw Skip{"NOT_AVAILABLE_IN_DISPOSABLE_ENVIRONMENT"};});
        // Stress: all outside objects remain inside this harness's disposable base.
        // Each attack has an independent arena. Retained root sharing is unchanged.
        // State machines retry incomplete restores: a denied restore must not silently
        // turn the remainder of a race into thousands of trivial NOT_FOUND results.
        f.dir(L"root/file-arena");f.file(L"root/file-arena/live.txt","SAFE_RACE_A");f.file(L"root/file-arena/spare.txt","SAFE_RACE_B");
        std::set<std::string> fileIds={f.id(L"root/file-arena/live.txt").text(),f.id(L"root/file-arena/spare.txt").text()};
        s.test("Q stress file replacement",[&]{int phase=0;runRace(s,f,root,"file-replacement",L"file-arena/live.txt",iterations,fileIds,[&](std::atomic<int>& c){
            const std::pair<std::wstring,std::wstring> moves[]={{L"root/file-arena/live.txt",L"root/file-arena/park.txt"},{L"root/file-arena/spare.txt",L"root/file-arena/live.txt"},{L"root/file-arena/live.txt",L"root/file-arena/spare.txt"},{L"root/file-arena/park.txt",L"root/file-arena/live.txt"}};
            if(f.move(moves[phase].first,moves[phase].second)){++c;phase=(phase+1)%4;}});});
        f.dir(L"root/parent-arena");f.dir(L"root/parent-arena/live");f.file(L"root/parent-arena/live/item.txt","SAFE_DIRECTORY");auto parentId=f.id(L"root/parent-arena/live/item.txt").text();
        s.test("P stress parent moved outside root",[&]{bool outside=false;runRace(s,f,root,"parent-move",L"parent-arena/live/item.txt",iterations,{parentId},[&](std::atomic<int>& c){
            if(f.move(outside?L"outside/dir-park":L"root/parent-arena/live",outside?L"root/parent-arena/live":L"outside/dir-park")){++c;outside=!outside;}});});
        f.file(L"outside/item.txt","OUTSIDE_DIRECTORY_SENTINEL");
        auto reparseRace=[&](const std::wstring& arena,const std::string& label,bool symbolic){
            f.dir(L"root/"+arena);f.dir(L"root/"+arena+L"/live");f.file(L"root/"+arena+L"/live/item.txt","SAFE_REPARSE_RACE");
            auto safe=f.id(L"root/"+arena+L"/live/item.txt").text();
            require(symbolic?f.sym(L"root/"+arena+L"/spare",L"outside",true):f.junction(L"root/"+arena+L"/spare",L"outside"),"REPARSE_CREATE_FAILED");
            int phase=0;auto prefix=L"root/"+arena+L"/";
            runRace(s,f,root,label,arena+L"/live/item.txt",iterations,{safe},[&](std::atomic<int>& c){
                const std::pair<std::wstring,std::wstring> moves[]={{prefix+L"live",prefix+L"park"},{prefix+L"spare",prefix+L"live"},{prefix+L"live",prefix+L"spare"},{prefix+L"park",prefix+L"live"}};
                if(f.move(moves[phase].first,moves[phase].second)){++c;phase=(phase+1)%4;}});
        };
        s.test("R stress junction introduction removal",[&]{reparseRace(L"junction-arena","junction-swap",false);});
        s.test("R stress symlink introduction removal",[&]{if(!symlink)throw Skip{"SYMLINK_PRIVILEGE_UNAVAILABLE"};reparseRace(L"symlink-arena","symlink-swap",true);});
        auto hardId=f.id(L"root/hard.txt").text();
        s.test("O stress hard-link create remove",[&]{runRace(s,f,root,"hard-link-churn",L"hard.txt",iterations,{hardId},[&](std::atomic<int>& c){if(f.hard(L"outside/churn-alias",L"root/hard.txt")){++c;std::this_thread::yield();f.unlink(L"outside/churn-alias");}});});
        s.test("N stress replacement by multiply linked object",[&]{f.dir(L"root/hard-arena");f.file(L"root/hard-arena/live.txt","SAFE_SWAP");require(f.hard(L"root/hard-arena/spare.txt",L"outside/sentinel.txt"),"HARDLINK_CREATE_FAILED");auto safeId=f.id(L"root/hard-arena/live.txt").text();int phase=0;
            runRace(s,f,root,"hard-link-replacement",L"hard-arena/live.txt",iterations,{safeId},[&](std::atomic<int>& c){
                const std::pair<std::wstring,std::wstring> moves[]={{L"root/hard-arena/live.txt",L"root/hard-arena/park.txt"},{L"root/hard-arena/spare.txt",L"root/hard-arena/live.txt"},{L"root/hard-arena/live.txt",L"root/hard-arena/spare.txt"},{L"root/hard-arena/park.txt",L"root/hard-arena/live.txt"}};
                if(f.move(moves[phase].first,moves[phase].second)){++c;phase=(phase+1)%4;}});});
        s.test("V W repeated registration cleanup",[&]{DWORD before=0,after=0;GetProcessHandleCount(GetCurrentProcess(),&before);for(int i=0;i<1000;++i){Root other(f.anchor.value,L"root");readOK(other.probeReadRelative(L"hello.txt",32),"SAFE_HELLO");denied(other.probeReadRelative(L"j-out/sentinel.txt",32));}GetProcessHandleCount(GetCurrentProcess(),&after);s.obs("handleCleanup","\"before\":"+std::to_string(before)+",\"after\":"+std::to_string(after));require(after<=before,"HANDLE_LEAK");});
        s.test("V failed registration cleanup",[&]{DWORD before=0,after=0;GetProcessHandleCount(GetCurrentProcess(),&before);for(int i=0;i<1000;++i)try{Root invalidRoot(f.anchor.value,L"root-link/sub");}catch(const Failure&){}GetProcessHandleCount(GetCurrentProcess(),&after);require(after<=before,"REGISTRATION_HANDLE_LEAK");});
        std::ofstream summary(output/L"summary.json");summary<<"{\"pass\":"<<s.pass<<",\"fail\":"<<s.fail<<",\"skip\":"<<s.skip<<",\"raceIterationsPerCase\":"<<iterations<<",\"READ_ONLY_FILESYSTEM\":\"NO-GO\",\"FILESYSTEM_MUTATION\":\"NO-GO\",\"PROCESS_EXECUTION\":\"NOT_EVALUATED\",\"GIT\":\"NOT_EVALUATED\",\"normalReadEntryPoint\":\"HARD_LINK_POLICY_UNPROVEN\",\"productionIntegration\":false,\"fixturesRetained\":true}\n";
        std::cout<<"TOTAL PASS="<<s.pass<<" FAIL="<<s.fail<<" SKIP="<<s.skip<<"\n";std::wcout<<L"EVIDENCE "<<output.wstring()<<L"\n";
        return s.fail?1:0;
    }catch(const std::exception& e){std::cerr<<"FATAL "<<e.what()<<"\n";return 2;}
}
