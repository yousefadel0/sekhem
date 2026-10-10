import { Brain, FileText, Lightbulb, GitCompare, Clock, CheckCircle, Plus, ChevronRight, Shield } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { knowledgeDocuments } from "@/lib/demo-data"

const technicalMemos = [
  {
    id: "memo-001",
    title: "SONiC 4.0 Requirements Analysis",
    status: "completed",
    createdAt: "2024-02-15",
    summary: "Comprehensive analysis of SONiC 4.0 requirements for sovereign deployment",
    insights: 12,
    recommendations: 5
  },
  {
    id: "memo-002",
    title: "EVPN-VXLAN Architecture Recommendation",
    status: "in-review",
    createdAt: "2024-02-14",
    summary: "Architecture decision record for EVPN-VXLAN overlay implementation",
    insights: 8,
    recommendations: 3
  },
  {
    id: "memo-003",
    title: "Security Policy Framework Assessment",
    status: "draft",
    createdAt: "2024-02-13",
    summary: "Assessment of current security policies against industry standards",
    insights: 15,
    recommendations: 7
  }
]

export default function AICTOPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center">
            <Brain className="w-6 h-6 text-gold" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI CTO Office</h1>
            <p className="text-sm text-muted-foreground">Requirement analysis, technical memo generation, and engineering planning</p>
          </div>
        </div>
        <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">
          Phase 1 Ready
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <FileText className="w-5 h-5 text-gold" />
            <p className="text-2xl font-bold text-foreground mt-2">12</p>
            <p className="text-xs text-muted-foreground">Technical Memos</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Lightbulb className="w-5 h-5 text-cyan" />
            <p className="text-2xl font-bold text-foreground mt-2">35</p>
            <p className="text-xs text-muted-foreground">Insights Generated</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <GitCompare className="w-5 h-5 text-success" />
            <p className="text-2xl font-bold text-foreground mt-2">15</p>
            <p className="text-xs text-muted-foreground">Recommendations</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50">
          <CardContent className="p-4">
            <Clock className="w-5 h-5 text-warning" />
            <p className="text-2xl font-bold text-foreground mt-2">3</p>
            <p className="text-xs text-muted-foreground">Pending Review</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-gold" />
                </div>
                <div className="text-left">
                  <p className="font-medium">New Technical Memo</p>
                  <p className="text-xs text-muted-foreground">Generate analysis document</p>
                </div>
              </div>
            </Button>
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan/20 flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-cyan" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Analyze Requirements</p>
                  <p className="text-xs text-muted-foreground">Parse requirements doc</p>
                </div>
              </div>
            </Button>
            <Button variant="outline" className="h-auto py-4 justify-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                  <GitCompare className="w-5 h-5 text-success" />
                </div>
                <div className="text-left">
                  <p className="font-medium">Architecture Review</p>
                  <p className="text-xs text-muted-foreground">Assess architecture decisions</p>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Technical Memos */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent Technical Memos</CardTitle>
          <Button variant="ghost" size="sm" className="text-xs text-gold">
            View All <ChevronRight className="w-3 h-3 ml-1" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {technicalMemos.map((memo) => (
            <div key={memo.id} className="p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gold" />
                  <h3 className="font-medium text-sm">{memo.title}</h3>
                </div>
                <Badge variant="outline" className={cn(
                  "text-[9px]",
                  memo.status === "completed" && "border-success/30 text-success",
                  memo.status === "in-review" && "border-warning/30 text-warning",
                  memo.status === "draft" && "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {memo.status}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">{memo.summary}</p>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Lightbulb className="w-3 h-3" /> {memo.insights} insights
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> {memo.recommendations} recommendations
                </span>
                <span>{memo.createdAt}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Human Approval Notice */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">Human Review Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                All technical memos, architecture recommendations, and engineering plans generated by the AI CTO 
                require human review and approval before implementation. AI-generated insights are advisory only.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
