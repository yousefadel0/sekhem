"use client"

import { useState } from "react"
import Link from "next/link"
import { 
  Code, FileCode, GitBranch, Play, CheckCircle, XCircle, Clock, 
  AlertTriangle, Lock, ChevronRight, Eye, Terminal, Shield,
  FolderTree, FileText, Diff, User
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

// Mock data for the sandboxed code draft
const draftBranch = {
  id: "draft-evpn-001",
  name: "draft/evpn-validation-framework",
  initiative: "EVPN BGP Validation Pack",
  initiativeId: "evpn-bgp-validation-pack",
  status: "pending-review",
  createdAt: "2024-02-14T16:00:00Z",
  lastModified: "2024-02-15T10:30:00Z",
  author: "AI Technical Planner",
  reviewers: ["Engineering Lead", "Security Team"],
  sandboxStatus: "isolated",
  ciStatus: "passed",
  testsPassed: 47,
  testsTotal: 52,
  securityScan: "clean",
  humanApprovalRequired: true
}

const changedFiles = [
  { path: "evpn_bgp_reference_topology.md", status: "added", lines: { added: 72, removed: 0 } },
  { path: "evpn_bgp_config_template.yaml", status: "added", lines: { added: 96, removed: 0 } },
  { path: "evpn_bgp_test_cases.yaml", status: "added", lines: { added: 84, removed: 0 } },
  { path: "validate_evpn_bgp_logs.py", status: "added", lines: { added: 58, removed: 0 } },
]

const codePreview = `# Sandboxed Artifact Preview
# Drafted by AI Technical Planner
# Human review required before any engineering adoption

artifact: evpn_bgp_config_template.yaml
mode: sandbox_only
production_repository_modification: false
automatic_merge: false
automatic_deployment: false

validation_scope:
  - EVPN BGP reference topology
  - Configuration template review
  - Test case pack definition
  - Log validation helper

excluded_scope:
  - SONiC core changes
  - FRR changes
  - SWSS changes
  - SAI changes
  - Platform driver changes
`

const testResults = [
  { name: "reference_topology_schema_review", status: "passed", duration: "0.4s" },
  { name: "configuration_template_syntax_review", status: "passed", duration: "0.6s" },
  { name: "test_case_pack_completeness_review", status: "passed", duration: "0.5s" },
  { name: "log_validation_helper_static_check", status: "passed", duration: "0.7s" },
  { name: "excluded_scope_guardrail_check", status: "passed", duration: "0.3s" },
  { name: "multi_homing_lab_dependency_review", status: "review-required", duration: "0.2s", error: "Lab execution is outside Phase 1 enabled scope" },
]

export default function SandboxedCodeDraftPage() {
  const [selectedFile, setSelectedFile] = useState(changedFiles[0].path)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Code className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sandboxed Code Draft Workspace</h1>
            <p className="text-sm text-muted-foreground">AI-drafted sandbox artifacts in an isolated workspace. Human review required.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning/30 text-warning">
            <Lock className="w-3 h-3 mr-1" />
            Human Review Required
          </Badge>
          <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">Limited Preview</Badge>
        </div>
      </div>

      {/* Safety Banner */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Sandboxed Artifacts – Human Engineering Review Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                These artifacts were drafted by the AI Technical Planner and are isolated in a sandbox workspace.
                Sandbox only. No production repository modification. No automatic merge. No automatic deployment.
                No SONiC core, FRR, SWSS, SAI, or platform driver changes.
                All artifacts require human engineering review and explicit approval before any engineering adoption.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Branch Info */}
      <Card className="border-cyan/30 bg-cyan/5">
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-cyan" />
              <div>
                <p className="font-mono text-sm font-medium">{draftBranch.name}</p>
                <p className="text-xs text-muted-foreground">
                  Initiative: <Link href={`/demo/initiatives/${draftBranch.initiativeId}`} className="text-cyan hover:underline">{draftBranch.initiative}</Link>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[9px] border-success/30 text-success">
                <Shield className="w-2.5 h-2.5 mr-1" />
                Sandbox Isolated
              </Badge>
              <Badge variant="outline" className={cn(
                "text-[9px]",
                draftBranch.ciStatus === "passed" ? "border-success/30 text-success" : "border-destructive/30 text-destructive"
              )}>
                CI: {draftBranch.ciStatus}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <FileCode className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">{changedFiles.length}</p>
            <p className="text-xs text-muted-foreground">Changed Artifacts</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <CheckCircle className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">{draftBranch.testsPassed}/{draftBranch.testsTotal}</p>
            <p className="text-xs text-muted-foreground">Tests Passed</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Shield className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2 capitalize">{draftBranch.securityScan}</p>
            <p className="text-xs text-muted-foreground">Security Scan</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2 capitalize">{draftBranch.status.replace("-", " ")}</p>
            <p className="text-xs text-muted-foreground">Status</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <User className="w-5 h-5 text-warning" />
            <p className="text-lg font-bold text-foreground mt-2">{draftBranch.reviewers.length}</p>
            <p className="text-xs text-muted-foreground">Reviewers Assigned</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="files" className="space-y-4">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="files" className="gap-2">
            <FolderTree className="w-4 h-4" />
            Changed Artifacts
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-2">
            <FileText className="w-4 h-4" />
            Sandboxed Artifact Preview
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-2">
            <Terminal className="w-4 h-4" />
            Test Results
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-2">
            <Diff className="w-4 h-4" />
            Diff View
          </TabsTrigger>
        </TabsList>

        {/* Changed Artifacts Tab */}
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FolderTree className="w-4 h-4 text-cyan" />
                Changed Artifacts ({changedFiles.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {changedFiles.map((file) => (
                <div 
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                    selectedFile === file.path ? "bg-cyan/10 border-cyan/30" : "bg-secondary/30 border-transparent hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FileCode className={cn(
                      "w-4 h-4",
                      file.status === "added" ? "text-success" : "text-gold"
                    )} />
                    <code className="text-sm font-mono">{file.path}</code>
                    <Badge variant="outline" className={cn(
                      "text-[9px]",
                      file.status === "added" ? "border-success/30 text-success" : "border-gold/30 text-gold"
                    )}>
                      {file.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-success">+{file.lines.added}</span>
                    {file.lines.removed > 0 && <span className="text-destructive">-{file.lines.removed}</span>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sandboxed Artifact Preview Tab */}
        <TabsContent value="code">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan" />
                  Sandboxed Artifact Preview
                </CardTitle>
                <Badge variant="outline" className="text-[9px] border-warning/30 text-warning">
                  Read-Only Artifact
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-[#1e1e1e] rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm font-mono text-[#d4d4d4] leading-relaxed whitespace-pre-wrap">{codePreview}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Test Results Tab */}
        <TabsContent value="tests">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {testResults.map((test) => (
                <div 
                  key={test.name}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg border",
                    test.status === "passed" ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {test.status === "passed" ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <XCircle className="w-4 h-4 text-destructive" />
                    )}
                    <div>
                      <code className="text-sm font-mono">{test.name}</code>
                      {test.error && (
                        <p className="text-xs text-destructive mt-1">{test.error}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{test.duration}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Diff View Tab */}
        <TabsContent value="diff">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Diff className="w-4 h-4 text-cyan" />
                Diff View
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-[#1e1e1e] rounded-lg p-4 font-mono text-sm">
                <div className="text-[#6a9955]">+ # Sandboxed EVPN BGP Artifact Pack</div>
                <div className="text-[#6a9955]">+ # Drafted by AI Technical Planner</div>
                <div className="text-[#6a9955]">+ # Human review required before any engineering adoption</div>
                <div className="text-[#6a9955]">+</div>
                <div className="text-[#6a9955]">+ artifact: evpn_bgp_reference_topology.md</div>
                <div className="text-[#6a9955]">+ artifact: evpn_bgp_config_template.yaml</div>
                <div className="text-[#6a9955]">+ artifact: evpn_bgp_test_cases.yaml</div>
                <div className="text-[#6a9955]">+ artifact: validate_evpn_bgp_logs.py</div>
                <div className="text-[#6a9955]">+ guardrails: sandbox_only, no_auto_merge, no_auto_deployment</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Actions */}
      <Card className="border-warning/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="w-4 h-4 text-warning" />
            Human Review Gate
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These sandboxed artifacts were drafted by the AI Technical Planner and require human engineering review before any engineering adoption. 
            AI technical assistants cannot approve, merge, deploy, or modify production repositories. All artifacts must pass security review.
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="border-success/30 text-success hover:bg-success/10">
              <CheckCircle className="w-4 h-4 mr-2" />
              Mark Ready for Human Engineering Review
            </Button>
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10">
              <XCircle className="w-4 h-4 mr-2" />
              Request Changes
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/demo/security-gate">
                <Shield className="w-4 h-4 mr-2" />
                Security Review
                <ChevronRight className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <Button variant="ghost" asChild>
              <Link href={`/demo/initiatives/${draftBranch.initiativeId}`}>
                <ChevronRight className="w-4 h-4 mr-2 rotate-180" />
                Back to Initiative
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/demo/security-gate">
                  Security Gate
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/demo/release-factory">
                  Release Factory
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
