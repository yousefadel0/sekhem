#include "fixture-support.hpp"
#include <userenv.h>
#include <aclapi.h>
#include <sddl.h>
#include <memory>

namespace {
// Fixed local pipe protocol. No listener, backend route, command, or production API.
constexpr DWORD Magic=0x32414230, Resume=0x52534d45;
struct Request { DWORD magic=Magic,op=1,bound=128,synchronize=0; wchar_t relative[1024]{}; };
struct Reply {
    DWORD magic=Magic,stage=0,error=0,count=0,appContainer=0,restricted=0,capabilities=0,integrity=0;
    DWORD linksBefore=0,linksAfter=0;
    char code[64]{},identity[80]{};
    unsigned char bytes[4096]{};
};
void writeAll(HANDLE h,const void* p,DWORD count) {
    auto b=static_cast<const unsigned char*>(p);
    while(count){DWORD n=0;require(WriteFile(h,b,count,&n,nullptr)&&n,"PIPE_WRITE_FAILED");b+=n;count-=n;}
}
bool readAll(HANDLE h,void* p,DWORD count) {
    auto b=static_cast<unsigned char*>(p);
    while(count){DWORD n=0;if(!ReadFile(h,b,count,&n,nullptr)||!n)return false;b+=n;count-=n;}return true;
}
Handle processToken(DWORD access=TOKEN_QUERY) {HANDLE h=nullptr;require(OpenProcessToken(GetCurrentProcess(),access,&h),"TOKEN_OPEN_FAILED");return Handle(h);}
std::vector<unsigned char> tokenInfo(HANDLE h,TOKEN_INFORMATION_CLASS c) {
    DWORD n=0;GetTokenInformation(h,c,nullptr,0,&n);require(n!=0,"TOKEN_QUERY_SIZE_FAILED");
    std::vector<unsigned char> b(n);require(GetTokenInformation(h,c,b.data(),n,&n),"TOKEN_QUERY_FAILED");return b;
}
Reply tokenReply() {
    Reply r;r.stage=3;auto t=processToken();auto a=tokenInfo(t.value,TokenIsAppContainer);
    r.appContainer=*reinterpret_cast<DWORD*>(a.data());r.restricted=IsTokenRestricted(t.value);
    auto c=tokenInfo(t.value,TokenCapabilities);r.capabilities=reinterpret_cast<TOKEN_GROUPS*>(c.data())->GroupCount;
    auto l=tokenInfo(t.value,TokenIntegrityLevel);auto sid=reinterpret_cast<TOKEN_MANDATORY_LABEL*>(l.data())->Label.Sid;
    r.integrity=*GetSidSubAuthority(sid,*GetSidSubAuthorityCount(sid)-1);
    strcpy_s(r.code,"TOKEN_VERIFIED");return r;
}
struct Sid {
    PSID value=nullptr;
    explicit Sid(const std::wstring& name){require(SUCCEEDED(DeriveAppContainerSidFromAppContainerName(name.c_str(),&value)),"DERIVE_SID_FAILED");}
    ~Sid(){if(value)FreeSid(value);}
};
struct DisposableProfile {
    std::wstring name;HRESULT created=E_FAIL;bool owned=false;
    explicit DisposableProfile(const std::wstring& n):name(n){
        PSID sid=nullptr;created=CreateAppContainerProfile(name.c_str(),L"SEKHEM disposable isolation spike",L"Temporary security experiment; no production data",nullptr,0,&sid);
        owned=SUCCEEDED(created);if(sid)FreeSid(sid);
    }
    HRESULT close(){if(!owned)return S_FALSE;auto hr=DeleteAppContainerProfile(name.c_str());if(SUCCEEDED(hr))owned=false;return hr;}
    ~DisposableProfile(){if(owned)close();}
};
// Only called for newly created disposable fixtures, never a real workspace.
void fixtureAcl(const fs::path& path,const std::vector<PSID>& readers,bool inherit=true) {
    auto token=processToken();auto user=tokenInfo(token.value,TokenUser);
    std::vector<EXPLICIT_ACCESSW> entries(1+readers.size());
    for(size_t i=0;i<entries.size();++i){auto& e=entries[i];e.grfAccessPermissions=i?FILE_GENERIC_READ|FILE_GENERIC_EXECUTE:FILE_ALL_ACCESS;
        e.grfAccessMode=SET_ACCESS;e.grfInheritance=inherit?SUB_CONTAINERS_AND_OBJECTS_INHERIT:NO_INHERITANCE;
        e.Trustee.TrusteeForm=TRUSTEE_IS_SID;e.Trustee.TrusteeType=TRUSTEE_IS_UNKNOWN;
        e.Trustee.ptstrName=reinterpret_cast<LPWSTR>(i?readers[i-1]:reinterpret_cast<TOKEN_USER*>(user.data())->User.Sid);}
    PACL acl=nullptr;require(SetEntriesInAclW(static_cast<ULONG>(entries.size()),entries.data(),nullptr,&acl)==ERROR_SUCCESS,"ACL_BUILD_FAILED");
    DWORD error=SetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION|PROTECTED_DACL_SECURITY_INFORMATION,nullptr,nullptr,acl,nullptr);
    LocalFree(acl);require(error==ERROR_SUCCESS,"FIXTURE_ACL_FAILED");
}
Handle restrictedToken(PSID sid) {
    auto t=processToken(TOKEN_QUERY|TOKEN_DUPLICATE|TOKEN_ASSIGN_PRIMARY);SID_AND_ATTRIBUTES restriction{sid,0};HANDLE restricted=nullptr;
    require(CreateRestrictedToken(t.value,DISABLE_MAX_PRIVILEGE,0,nullptr,0,nullptr,1,&restriction,&restricted),"RESTRICTED_TOKEN_FAILED");
    return Handle(restricted);
}
bool inheritedAce(const fs::path& path,PSID sid) {
    PSECURITY_DESCRIPTOR sd=nullptr;PACL acl=nullptr;
    require(GetNamedSecurityInfoW(const_cast<LPWSTR>(path.c_str()),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,nullptr,nullptr,&acl,nullptr,&sd)==ERROR_SUCCESS,"ACL_QUERY_FAILED");
    bool found=false;
    for(DWORD i=0;acl&&i<acl->AceCount;++i){void* p=nullptr;if(GetAce(acl,i,&p)){auto a=static_cast<ACCESS_ALLOWED_ACE*>(p);
        if(a->Header.AceType==ACCESS_ALLOWED_ACE_TYPE&&(a->Header.AceFlags&INHERITED_ACE)&&EqualSid(&a->SidStart,sid))found=true;}}
    LocalFree(sd);return found;
}
int worker(const fs::path& selection) {
    const auto base=selection.parent_path();
    // Harness bootstrap only. There is no externally reachable broker/root registration.
    if(base.filename().wstring().rfind(L"sekhem-isolation-",0)!=0 ||
       (selection.filename()!=L"workspace"&&selection.filename()!=L"snapshot"))return 4;
    HANDLE input=GetStdHandle(STD_INPUT_HANDLE),output=GetStdHandle(STD_OUTPUT_HANDLE);
    try {
        Handle anchor(CreateFileW(selection.c_str(),FILE_LIST_DIRECTORY|FILE_READ_ATTRIBUTES|SYNCHRONIZE,
            FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_FLAG_BACKUP_SEMANTICS|FILE_FLAG_OPEN_REPARSE_POINT,nullptr));
        require(bool(anchor),"WORKER_ANCHOR_DENIED");Root root(anchor.value,L"data");
        auto hello=tokenReply();writeAll(output,&hello,sizeof(hello));
        Request q;
        while(readAll(input,&q,sizeof(q))){
            if(q.magic!=Magic||!wmemchr(q.relative,0,1024)||q.bound==0||q.bound>4096)break;
            if(q.op==9)break;
            Reply r;
            if(q.op==1){
                auto result=root.probeReadRelative(q.relative,q.bound,[&](const char* stage,HANDLE h){
                    DWORD phase=std::string(stage)=="after_pre_read_check"?1:(std::string(stage)=="after_read"?2:0);
                    if(q.synchronize&&phase){Reply event;event.stage=phase;strcpy_s(event.identity,inspectHandle(h).id.text().c_str());
                        writeAll(output,&event,sizeof(event));DWORD ack=0;require(readAll(input,&ack,sizeof(ack))&&ack==Resume,"BAD_HOOK_ACK");}
                });
                strcpy_s(r.code,result.code.c_str());strcpy_s(r.identity,result.identity.text().c_str());
                r.linksBefore=result.linksBefore;r.linksAfter=result.linksAfter;r.count=static_cast<DWORD>(result.bytes.size());
                if(r.count)memcpy(r.bytes,result.bytes.data(),r.count);
            } else if(q.op==2||q.op==3) {
                // Direct OS negative controls: fixed fixture paths only, no arbitrary path.
                fs::path p;
                const std::wstring which=q.relative;
                if(which==L"outside")p=base/L"outside"/L"sentinel.txt";
                else if(which==L"outside-alias")p=base/L"outside"/L"alias.txt";
                else if(which==L"outside-junction")p=selection/L"data"/L"escape"/L"sentinel.txt";
                else if(which==L"ads")p=selection/L"data"/L"hello.txt:metadata";
                else if(which==L"sensitive")p=selection/L"data"/L".env";
                else if(which==L"source")p=base/L"workspace"/L"data"/L"hello.txt";
                else if(which==L"hello")p=selection/L"data"/L"hello.txt";
                else {strcpy_s(r.code,"INVALID_CONTROL");writeAll(output,&r,sizeof(r));continue;}
                Handle h(CreateFileW(p.c_str(),q.op==3?FILE_WRITE_DATA:GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,0,nullptr));
                r.error=h?0:GetLastError();strcpy_s(r.code,h?"OPENED":"ACCESS_DENIED");
                if(h&&q.op==2){DWORD n=0;if(ReadFile(h.value,r.bytes,q.bound,&n,nullptr)){r.count=n;strcpy_s(r.code,"OK");strcpy_s(r.identity,inspectHandle(h.value).id.text().c_str());}else r.error=GetLastError();}
                // q.op 3 never writes: it only tests whether write access can be acquired.
            } else strcpy_s(r.code,"INVALID_OPERATION");
            writeAll(output,&r,sizeof(r));
        }
        return 0;
    } catch(const std::exception& e){Reply r;r.stage=4;strcpy_s(r.code,e.what());r.error=GetLastError();try{writeAll(output,&r,sizeof(r));}catch(...){}return 5;}
}
struct Client {
    Handle input,output,process;Reply hello{};std::string launchError;
    Client(const fs::path& exe,const fs::path& workspace,PSID appSid,HANDLE restricted=nullptr) {
        SECURITY_ATTRIBUTES sa{sizeof(sa),nullptr,TRUE};HANDLE inR=nullptr,inW=nullptr,outR=nullptr,outW=nullptr;
        require(CreatePipe(&inR,&inW,&sa,0)&&CreatePipe(&outR,&outW,&sa,0),"PIPE_CREATE_FAILED");
        Handle childIn(inR),childOut(outW);input=Handle(inW);output=Handle(outR);
        SetHandleInformation(input.value,HANDLE_FLAG_INHERIT,0);SetHandleInformation(output.value,HANDLE_FLAG_INHERIT,0);
        SIZE_T size=0;DWORD attrCount=appSid?2:1;InitializeProcThreadAttributeList(nullptr,attrCount,0,&size);
        std::vector<unsigned char> storage(size);auto attrs=reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(storage.data());
        require(InitializeProcThreadAttributeList(attrs,attrCount,0,&size),"ATTRIBUTE_INIT_FAILED");
        SECURITY_CAPABILITIES caps{};caps.AppContainerSid=appSid;
        HANDLE inherited[]={childIn.value,childOut.value};
        bool ready=UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_HANDLE_LIST,inherited,sizeof(inherited),nullptr,nullptr)!=0;
        if(appSid)ready=ready&&UpdateProcThreadAttribute(attrs,0,PROC_THREAD_ATTRIBUTE_SECURITY_CAPABILITIES,&caps,sizeof(caps),nullptr,nullptr)!=0;
        STARTUPINFOEXW startup{};startup.StartupInfo.cb=sizeof(startup);startup.lpAttributeList=attrs;
        startup.StartupInfo.dwFlags=STARTF_USESTDHANDLES;startup.StartupInfo.hStdInput=childIn.value;
        startup.StartupInfo.hStdOutput=startup.StartupInfo.hStdError=childOut.value;
        PROCESS_INFORMATION pi{};std::wstring command=L"\""+exe.wstring()+L"\" --broker \""+workspace.wstring()+L"\"";
        // Minimal environment: do not inherit credentials or the developer's environment.
        wchar_t environment[]=L"SystemRoot=C:\\Windows\0WINDIR=C:\\Windows\0\0";
        BOOL ok=FALSE;DWORD error=0;
        if(ready){
            DWORD flags=CREATE_NO_WINDOW|EXTENDED_STARTUPINFO_PRESENT|CREATE_UNICODE_ENVIRONMENT;
            ok=restricted?CreateProcessAsUserW(restricted,exe.c_str(),command.data(),nullptr,nullptr,TRUE,flags,environment,workspace.c_str(),&startup.StartupInfo,&pi):
                CreateProcessW(exe.c_str(),command.data(),nullptr,nullptr,TRUE,flags,environment,workspace.c_str(),&startup.StartupInfo,&pi);
        }
        error=GetLastError();DeleteProcThreadAttributeList(attrs);childIn.reset();childOut.reset();
        if(!ok){launchError="CREATE_PROCESS_"+std::to_string(error);return;}
        process=Handle(pi.hProcess);Handle thread(pi.hThread);
        try{hello=receive();if(hello.stage!=3)launchError=std::string(hello.code)+"_"+std::to_string(hello.error);}
        catch(const std::exception& e){DWORD code=0;GetExitCodeProcess(process.value,&code);launchError=std::string(e.what())+"_EXIT_"+std::to_string(code);}
    }
    ~Client(){input.reset();if(process&&WaitForSingleObject(process.value,3000)==WAIT_TIMEOUT){TerminateProcess(process.value,7);WaitForSingleObject(process.value,3000);}}
    Reply receive(){
        const auto start=GetTickCount64();
        for(;;){DWORD available=0;if(!PeekNamedPipe(output.value,nullptr,0,nullptr,&available,nullptr))throw Failure("PIPE_CLOSED");
            if(available>=sizeof(Reply))break;if(GetTickCount64()-start>10000)throw Failure("BROKER_TIMEOUT");Sleep(1);}
        Reply r;require(readAll(output.value,&r,sizeof(r))&&r.magic==Magic,"INVALID_REPLY");return r;
    }
    Reply ask(const std::wstring& path,DWORD op=1,const std::function<void(DWORD,const Reply&)>& hook={}) {
        require(launchError.empty(),"BROKER_NOT_RUNNING");Request q;q.op=op;q.synchronize=hook?1:0;
        require(path.size()<1024,"REQUEST_TOO_LONG");wcscpy_s(q.relative,path.c_str());writeAll(input.value,&q,sizeof(q));
        for(;;){auto r=receive();if(r.stage==1||r.stage==2){require(bool(hook),"UNEXPECTED_HOOK");hook(r.stage,r);DWORD ack=Resume;writeAll(input.value,&ack,sizeof(ack));}
            else return r;}
    }
};
void allowed(const Reply& r,const char* text){require(std::string(r.code)=="OK"&&std::string(reinterpret_cast<const char*>(r.bytes),r.count)==text,"EXPECTED_READ_FAILED");}
void rejected(const Reply& r,const char* code=nullptr){require(r.count==0&&std::string(r.code)!="OK"&&std::string(r.code)!="OPENED","EXPECTED_DENIAL_FAILED");if(code)require(std::string(r.code)==code,"WRONG_DENIAL");}
void runABA(Suite& s,Fixtures& f,Client& c,const std::string& prefix,const std::wstring& root,int count) {
    int exercised=0,released=0,denials=0;
    for(int i=0;i<count;++i){
        bool made=false,removed=false,same=false;std::string opened;
        const auto before=f.id(root+L"/data/hello.txt").text();
        auto r=c.ask(L"hello.txt",1,[&](DWORD stage,const Reply& event){
            if(stage==1){opened=event.identity;made=f.hard(L"outside/alias.txt",root+L"/data/hello.txt");same=made&&f.id(L"outside/alias.txt").text()==opened;}
            if(stage==2&&made)removed=f.unlink(L"outside/alias.txt");
        });
        if(made&&removed&&same)++exercised;
        const bool breach=made&&removed&&same&&r.count>0;if(breach)++released;else if(!r.count)++denials;
        s.trace<<"{\"architecture\":"<<jsonQuote(prefix)<<",\"operation\":\"hard-link-ABA\",\"iteration\":"<<i<<",\"identityBefore\":"<<jsonQuote(before)
            <<",\"identityOpened\":"<<jsonQuote(opened)<<",\"outsideAliasDuringRead\":"<<(same?"true":"false")<<",\"removedBeforePostCheck\":"<<(removed?"true":"false")
            <<",\"bytesReleased\":"<<r.count<<",\"result\":"<<jsonQuote(r.code)<<",\"hardLinkPolicyBreach\":"<<(breach?"true":"false")<<"}\n";
    }
    s.obs(prefix+"ABA","\"attempts\":"+std::to_string(count)+",\"exercised\":"+std::to_string(exercised)+",\"released\":"+std::to_string(released)+",\"denied\":"+std::to_string(denials));
    require(exercised==count,"ATTACK_NOT_FULLY_EXERCISED");require(released==0,"OUTSIDE_HARD_LINK_PRESENT_DURING_READ");
}
void workerMatrix(Suite& s,Fixtures& f,Client& c,const std::string& family) {
    if(!c.launchError.empty()){s.test(family+" process launch",[&]{throw Skip{c.launchError};});return;}
    s.obs(family+"Token","\"appContainer\":"+std::to_string(c.hello.appContainer)+",\"restricted\":"+std::to_string(c.hello.restricted)
        +",\"capabilities\":"+std::to_string(c.hello.capabilities)+",\"integrityRid\":"+std::to_string(c.hello.integrity));
    s.test(family+" restricted process token",[&]{require(family=="A"?c.hello.appContainer==1:c.hello.restricted==1,"NOT_ISOLATED_TOKEN");});
    s.test(family+" normal read",[&]{allowed(c.ask(L"hello.txt"),"SAFE_HELLO");});
    const std::vector<std::pair<std::string,std::wstring>> invalid={{"traversal",L"../outside/sentinel.txt"},{"absolute",L"C:/outside.txt"},{"UNC",L"//invalid-share/test"},{"device",L"\\\\?\\GLOBALROOT\\Device\\x"},{"ADS",L"hello.txt:metadata"}};
    for(const auto& p:invalid)s.test(family+" "+p.first,[&]{rejected(c.ask(p.second),"INVALID_RELATIVE_PATH");});
    s.test(family+" sensitive path",[&]{rejected(c.ask(L".env"),"SENSITIVE_PATH_DENIED");});
    s.test(family+" direct outside file denied by OS",[&]{auto r=c.ask(L"outside",2);rejected(r);require(r.error==ERROR_ACCESS_DENIED,"DENIAL_NOT_ACCESS_CHECK");});
    s.test(family+" write access denied by OS",[&]{rejected(c.ask(L"hello",3));});
    s.test(family+" junction rejected by boundary",[&]{rejected(c.ask(L"escape/sentinel.txt"),"REPARSE_POINT_DENIED");});
    s.test(family+" direct junction denied by OS",[&]{rejected(c.ask(L"outside-junction",2));});
    s.test(family+" incoming ungranted hard link denied by OS",[&]{rejected(c.ask(L"incoming.txt"));});
    s.test(family+" held file rename denied",[&]{bool moved=false;auto r=c.ask(L"hello.txt",1,[&](DWORD stage,const Reply&){if(stage==1)moved=f.move(L"workspace/data/hello.txt",L"outside/held-renamed.txt");});require(!moved,"HELD_FILE_MOVED");allowed(r,"SAFE_HELLO");});
    s.test(family+" held file replacement denied",[&]{bool removed=false;auto r=c.ask(L"hello.txt",1,[&](DWORD stage,const Reply&){if(stage==1)removed=f.unlink(L"workspace/data/hello.txt");});require(!removed,"HELD_FILE_DELETED");allowed(r,"SAFE_HELLO");});
    s.test(family+" normal user cannot create outside hard link",[&]{bool created=f.hard(L"outside/alias.txt",L"workspace/data/hello.txt");if(created)f.unlink(L"outside/alias.txt");require(!created,"NORMAL_USER_CREATED_OUTSIDE_ALIAS");});
    s.test(family+" preopened attributes handle cannot create outside link",[&]{
        Handle h(CreateFileW(f.p(L"workspace/data/hello.txt").c_str(),FILE_READ_ATTRIBUTES|SYNCHRONIZE,7,nullptr,OPEN_EXISTING,0,nullptr));require(bool(h),"PREOPEN_FAILED");NTSTATUS result=-1;bool same=false;
        c.ask(L"hello.txt",1,[&](DWORD phase,const Reply& event){if(phase==1){result=linkThroughHandle(h.value,f.p(L"outside/alias.txt"));same=result>=0&&f.id(L"outside/alias.txt").text()==event.identity;}if(phase==2&&result>=0)f.unlink(L"outside/alias.txt");});
        s.obs(family+"NativeLink","\"ntstatus\":"+std::to_string(static_cast<ULONG>(result))+",\"sameObject\":"+(same?"true":"false"));require(result<0,"PREOPENED_HANDLE_LINK_CREATED");
    });
    s.test(family+" exact 0B2 hard-link interleaving",[&]{runABA(s,f,c,family,L"workspace",1000);});
    s.test(family+" outside pathname alias denied by OS",[&]{
        require(f.hard(L"outside/alias.txt",L"workspace/data/hello.txt"),"ALIAS_SETUP_FAILED");
        auto r=c.ask(L"outside-alias",2);f.unlink(L"outside/alias.txt");
        s.obs(family+"OutsideAliasRead","\"bytes\":"+std::to_string(r.count)+",\"code\":"+jsonQuote(r.code)+",\"win32\":"+std::to_string(r.error));rejected(r);
    });
    s.test(family+" OS ACL alone denies sensitive and ADS content",[&]{
        auto sensitive=c.ask(L"sensitive",2),ads=c.ask(L"ads",2);
        s.obs(family+"PolicySeparation","\"sensitiveBytes\":"+std::to_string(sensitive.count)+",\"adsBytes\":"+std::to_string(ads.count));
        rejected(sensitive);rejected(ads);
    });
}
}

int wmain(int argc,wchar_t** argv) {
    if(argc==3&&std::wstring(argv[1])==L"--broker")return worker(argv[2]);
    if(argc!=1)return 2;
    try{
        auto output=fs::current_path()/L"evidence"/(L"run-"+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(GetTickCount64()));
        Suite s(output);Fixtures f;std::ofstream(output/L"fixture-location.txt")<<f.base.u8string()<<"\n";
        const auto started=GetTickCount64();
        const auto suffix=std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64());
        const auto appName=L"SEKHEM.SpikeA."+suffix,snapName=L"SEKHEM.SpikeC."+suffix;
        DisposableProfile appProfile(appName),snapProfile(snapName);
        Sid app(appName),snap(snapName),acl(L"SEKHEM.SpikeB."+suffix);
        s.obs("profileSetup","\"A\":"+std::to_string(static_cast<ULONG>(appProfile.created))+",\"C\":"+std::to_string(static_cast<ULONG>(snapProfile.created)));
        fixtureAcl(f.base,{});f.dir(L"workspace");fixtureAcl(f.p(L"workspace"),{app.value,acl.value});
        f.dir(L"workspace/data");f.dir(L"outside");fixtureAcl(f.p(L"outside"),{});
        f.dir(L"snapshot");fixtureAcl(f.p(L"snapshot"),{snap.value});f.dir(L"snapshot/data");
        f.dir(L"bin");fixtureAcl(f.p(L"bin"),{app.value,snap.value,acl.value});
        f.file(L"workspace/data/hello.txt","SAFE_HELLO");f.file(L"workspace/data/hello.txt:metadata","DUMMY_ADS");f.file(L"workspace/data/.env","DUMMY_SECRET");
        f.file(L"outside/sentinel.txt","OUTSIDE_SENTINEL");
        require(f.junction(L"workspace/data/escape",L"outside"),"JUNCTION_SETUP_FAILED");
        require(f.hard(L"workspace/data/incoming.txt",L"outside/sentinel.txt"),"HARD_LINK_SETUP_FAILED");
        wchar_t self[32768]{};require(GetModuleFileNameW(nullptr,self,32768)>0,"SELF_PATH_FAILED");
        require(CopyFileW(self,f.p(L"bin/broker.exe").c_str(),TRUE),"BROKER_COPY_FAILED");fixtureAcl(f.p(L"bin/broker.exe"),{app.value,snap.value,acl.value},false);
        auto module=LoadLibraryW(L"userenv.dll");
        s.obs("availableApis","\"DeriveAppContainerSid\":"+std::string(GetProcAddress(module,"DeriveAppContainerSidFromAppContainerName")?"true":"false")
            +",\"CreateAppContainerProfile\":"+(GetProcAddress(module,"CreateAppContainerProfile")?"true":"false")+",\"packagedWin32IsolationActivated\":false");FreeLibrary(module);
        auto normal=tokenReply();s.obs("attackerToken","\"appContainer\":"+std::to_string(normal.appContainer)+",\"restricted\":"+std::to_string(normal.restricted)+",\"integrityRid\":"+std::to_string(normal.integrity));
        s.test("B workspace ACL inherited by source file",[&]{require(inheritedAce(f.p(L"workspace/data/hello.txt"),acl.value),"READER_ACE_NOT_INHERITED");});
        s.test("B outside file has no inherited workspace grant",[&]{require(!inheritedAce(f.p(L"outside/sentinel.txt"),acl.value),"OUTSIDE_GRANT_PRESENT");});
        {
            Client a(f.p(L"bin/broker.exe"),f.p(L"workspace"),app.value);workerMatrix(s,f,a,"A");
        }
        {
            try{auto restricted=restrictedToken(acl.value);Client b(f.p(L"bin/broker.exe"),f.p(L"workspace"),nullptr,restricted.value);workerMatrix(s,f,b,"B");}
            catch(const std::exception& e){s.test("B restricted identity setup",[&]{throw Skip{std::string(e.what())+"_"+std::to_string(GetLastError())};});}
        }
        // C: bounded byte reconstruction, not CopyFile as an authorization primitive.
        Root source(f.anchor.value,L"workspace/data");
        s.test("C ordinary bounded acquisition",[&]{auto r=source.probeReadRelative(L"hello.txt",128);readOK(r,"SAFE_HELLO");f.file(L"snapshot/data/hello.txt",data(r));});
        s.test("C reconstructed object is fresh single-link non-reparse",[&]{auto src=f.id(L"workspace/data/hello.txt"),dst=f.id(L"snapshot/data/hello.txt");
            Handle h(CreateFileW(f.p(L"snapshot/data/hello.txt").c_str(),FILE_READ_ATTRIBUTES,7,nullptr,OPEN_EXISTING,FILE_FLAG_OPEN_REPARSE_POINT,nullptr));auto info=inspectHandle(h.value);
            require(!(src==dst)&&info.standard.NumberOfLinks==1&&!(info.attributes.FileAttributes&FILE_ATTRIBUTE_REPARSE_POINT),"SNAPSHOT_OBJECT_NOT_FRESH");});
        s.test("C reconstructed content has no source ADS",[&]{Handle h(CreateFileW(f.p(L"snapshot/data/hello.txt:metadata").c_str(),GENERIC_READ,7,nullptr,OPEN_EXISTING,0,nullptr));require(!h&&GetLastError()==ERROR_FILE_NOT_FOUND,"SOURCE_ADS_COPIED");});
        s.test("C destination inherits only its explicit snapshot grant",[&]{require(inheritedAce(f.p(L"snapshot/data/hello.txt"),snap.value)&&!inheritedAce(f.p(L"snapshot/data/hello.txt"),app.value),"WRONG_SNAPSHOT_ACL");});
        s.test("C acquisition rejects junction",[&]{denied(source.probeReadRelative(L"escape/sentinel.txt",128),"REPARSE_POINT_DENIED");});
        s.test("C acquisition rejects existing hard links",[&]{denied(source.probeReadRelative(L"incoming.txt",128),"HARD_LINK_POLICY_DENIED");});
        s.test("C acquisition rejects ADS",[&]{denied(source.probeReadRelative(L"hello.txt:metadata",128),"INVALID_RELATIVE_PATH");});
        s.test("C acquisition rejects sensitive file",[&]{denied(source.probeReadRelative(L".env",128),"SENSITIVE_PATH_DENIED");});
        s.test("C acquisition rejects symbolic link",[&]{if(!f.sym(L"workspace/data/symlink.txt",L"outside/sentinel.txt",false))throw Skip{"CreateSymbolicLinkW_"+std::to_string(GetLastError())};denied(source.probeReadRelative(L"symlink.txt",128),"REPARSE_POINT_DENIED");});
        s.test("C generic CopyFile strips ADS",[&]{require(CopyFileW(f.p(L"workspace/data/hello.txt").c_str(),f.p(L"snapshot/data/naive.txt").c_str(),TRUE),"COPYFILE_FAILED");
            Handle h(CreateFileW(f.p(L"snapshot/data/naive.txt:metadata").c_str(),GENERIC_READ,7,nullptr,OPEN_EXISTING,0,nullptr));require(!h,"COPYFILE_PRESERVED_ADS");});
        s.test("C source acquisition prevents transient outside alias",[&]{int exercised=0,released=0,copied=0;
            for(int i=0;i<1000;++i){bool made=false,removed=false,same=false;std::string id;
                auto r=source.probeReadRelative(L"hello.txt",128,[&](const char* stage,HANDLE h){
                    if(std::string(stage)=="after_pre_read_check"){id=inspectHandle(h).id.text();made=f.hard(L"outside/alias.txt",L"workspace/data/hello.txt");same=made&&f.id(L"outside/alias.txt").text()==id;}
                    if(std::string(stage)=="after_read"&&made)removed=f.unlink(L"outside/alias.txt");
                });
                if(made&&removed&&same)++exercised;if(made&&removed&&same&&r.status=="READ"){++released;if(!copied){f.file(L"snapshot/data/acquired-during-alias.txt",data(r));++copied;}}
                s.trace<<"{\"architecture\":\"C-source\",\"iteration\":"<<i<<",\"identityOpened\":"<<jsonQuote(id)<<",\"outsideAliasDuringRead\":"<<(same?"true":"false")
                    <<",\"bytesReleased\":"<<r.bytes.size()<<",\"result\":"<<jsonQuote(r.code)<<"}\n";
            }
            s.obs("CSourceABA","\"attempts\":1000,\"exercised\":"+std::to_string(exercised)+",\"released\":"+std::to_string(released)+",\"copiedArtifacts\":"+std::to_string(copied));require(exercised==1000,"ACQUISITION_ATTACK_NOT_EXERCISED");require(released==0,"UNAUTHORIZED_SOURCE_ACQUISITION");
        });
        {
            Client c(f.p(L"bin/broker.exe"),f.p(L"snapshot"),snap.value);
            if(!c.launchError.empty())s.test("C isolated reader launch",[&]{throw Skip{c.launchError};});
            else{
                s.test("C reader has AppContainer identity",[&]{require(c.hello.appContainer==1&&c.hello.capabilities==0,"SNAPSHOT_READER_NOT_ISOLATED");});
                s.test("C isolated snapshot read",[&]{allowed(c.ask(L"hello.txt"),"SAFE_HELLO");});
                s.test("C isolated reader cannot read source workspace",[&]{rejected(c.ask(L"source",2));});
                s.test("C isolated reader cannot read outside object",[&]{rejected(c.ask(L"outside",2));});
                s.test("C isolated reader cannot acquire write access",[&]{rejected(c.ask(L"hello",3));});
                s.test("C snapshot excludes normal-user alias manipulation",[&]{runABA(s,f,c,"C-snapshot",L"snapshot",1000);});
            }
        }
        s.test("A disposable profile removed",[&]{require(appProfile.owned,"PROFILE_WAS_NOT_CREATED");require(SUCCEEDED(appProfile.close()),"PROFILE_DELETE_FAILED");});
        s.test("C disposable profile removed",[&]{require(snapProfile.owned,"PROFILE_WAS_NOT_CREATED");require(SUCCEEDED(snapProfile.close()),"PROFILE_DELETE_FAILED");});
        s.obs("duration","\"milliseconds\":"+std::to_string(GetTickCount64()-started));
        std::ofstream summary(output/L"summary.json");summary<<"{\"pass\":"<<s.pass<<",\"fail\":"<<s.fail<<",\"skip\":"<<s.skip<<",\"decision\":\"NO SAFE LOCAL READ ARCHITECTURE DEMONSTRATED\",\"productionIntegration\":false,\"profilesStillOwned\":"<<(appProfile.owned||snapProfile.owned?"true":"false")<<",\"fixturesRetained\":true}\n";
        std::cout<<"TOTAL "<<s.pass<<" PASS "<<s.fail<<" FAIL "<<s.skip<<" SKIP\n";return s.fail?1:0;
    }catch(const std::exception& e){std::cerr<<"FATAL "<<e.what()<<" WIN32 "<<GetLastError()<<"\n";return 3;}
}
