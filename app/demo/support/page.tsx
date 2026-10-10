import { AlertTriangle, BookOpen, FileText, Headphones, LifeBuoy, PackageCheck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

const supportSections = [
  {
    title: "Open support case",
    description: "Create a mock support request with summary, severity, owner, and evidence notes.",
    icon: LifeBuoy,
    badge: "Mock Intake"
  },
  {
    title: "Knowledge base",
    description: "Browse guidance articles, handover notes, and operating procedures for Phase 1 Activation.",
    icon: BookOpen,
    badge: "Reference"
  },
  {
    title: "Incident escalation",
    description: "Review escalation paths for service-impacting incidents and human approval gates.",
    icon: AlertTriangle,
    badge: "Governed"
  },
  {
    title: "Activation support",
    description: "Track activation questions, workspace readiness, and module enablement requests.",
    icon: PackageCheck,
    badge: "Phase 1"
  },
  {
    title: "Handover documents",
    description: "Access training notes, acceptance checklists, and customer handover artifacts.",
    icon: FileText,
    badge: "Documents"
  }
]

export default function SupportCenterPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Headphones className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Support Center</h1>
            <p className="text-sm text-muted-foreground mt-1">Mock support workspace for cases, knowledge, escalation, and handover.</p>
          </div>
        </div>
        <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">Phase 1 Activation</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {supportSections.map((section) => {
          const Icon = section.icon
          return (
            <Card key={section.title} className="bg-card/50 border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan/10 border border-cyan/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-cyan" />
                    </div>
                    <CardTitle className="text-sm">{section.title}</CardTitle>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-cyan/30 text-cyan">
                    {section.badge}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">{section.description}</p>
                <Button variant="outline" size="sm" className="text-xs border-cyan/30 text-cyan hover:bg-cyan/10">
                  View
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
