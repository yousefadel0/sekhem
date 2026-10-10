"use client"

import Link from "next/link"
import { 
  Lock, 
  Server,
  Cpu,
  Code,
  BrainCircuit,
  Wifi,
  Shield,
  Calendar,
  ChevronRight,
  HardDrive,
  Network,
  AlertCircle
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useLockedModulesApiData } from "@/lib/sekhem-api-fallbacks"

interface LockedModule {
  id: string
  name: string
  slug: string
  description: string
  icon: React.ElementType
  category: "infrastructure" | "compute" | "integration" | "security" | "support"
  hardwareRequired: boolean
  gpuRequired: boolean
  labRequired: boolean
  lockReason: string
}

const fallbackLockedModules: LockedModule[] = [
  {
    id: "deep-nos",
    name: "Deep NOS Implementation",
    slug: "deep-nos-implementation",
    description: "Full network operating system integration with production deployment support for sovereign SONiC deployments.",
    icon: Server,
    category: "infrastructure",
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true,
    lockReason: "Requires Advanced Package Activation and dedicated infrastructure"
  },
  {
    id: "hardware-lab",
    name: "Hardware Lab Automation",
    slug: "hardware-lab-automation",
    description: "Automated hardware-in-loop testing with physical switch validation and performance benchmarking.",
    icon: Cpu,
    category: "infrastructure",
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true,
    lockReason: "Requires physical lab hardware and dedicated infrastructure"
  },
  {
    id: "self-hosted-runner",
    name: "Self-hosted Code Runner",
    slug: "self-hosted-code-runner",
    description: "Run AI code generation on your own infrastructure with full data sovereignty and air-gapped operation.",
    icon: Code,
    category: "compute",
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: false,
    lockReason: "Requires dedicated compute infrastructure and security configuration"
  },
  {
    id: "local-llm",
    name: "Local LLM Server",
    slug: "local-llm-server",
    description: "Deploy AI models locally with GPU acceleration for complete data privacy and offline operation.",
    icon: BrainCircuit,
    category: "compute",
    hardwareRequired: true,
    gpuRequired: true,
    labRequired: false,
    lockReason: "Requires GPU hardware and local model deployment infrastructure"
  },
  {
    id: "openwifi-extension",
    name: "OpenWiFi Extension",
    slug: "openwifi-extension",
    description: "Extended validation for OpenWiFi access point deployments with converged wired/wireless testing.",
    icon: Wifi,
    category: "integration",
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true,
    lockReason: "Requires OpenWiFi infrastructure and extension activation"
  },
  {
    id: "advanced-security",
    name: "Advanced Security Compliance",
    slug: "advanced-security-compliance",
    description: "Enhanced security scanning and compliance reporting for regulated environments (SOC 2, ISO 27001).",
    icon: Shield,
    category: "security",
    hardwareRequired: false,
    gpuRequired: false,
    labRequired: false,
    lockReason: "Requires compliance framework configuration and security team approval"
  },
  {
    id: "annual-update",
    name: "Annual Update Package",
    slug: "annual-update-package",
    description: "Priority access to new features, extended support coverage, and continuous platform updates.",
    icon: Calendar,
    category: "support",
    hardwareRequired: false,
    gpuRequired: false,
    labRequired: false,
    lockReason: "Requires active support subscription"
  }
]

const categoryColors: Record<string, string> = {
  infrastructure: "border-cyan/30 text-cyan",
  compute: "border-gold/30 text-gold",
  integration: "border-success/30 text-success",
  security: "border-warning/30 text-warning",
  support: "border-info/30 text-info"
}

const lockedModuleIcons: Record<string, React.ElementType> = {
  "Deep NOS Implementation": Server,
  "Hardware Lab Automation": Cpu,
  "Self-hosted Code Runner": Code,
  "Local LLM Server": BrainCircuit,
  "OpenWiFi Extension": Wifi,
  "Advanced Security Compliance": Shield,
  "Annual Update Package": Calendar,
  "Repository Intelligence": Code,
  "Workflow Manager": Network
}

export default function LockedAdvancedModulesPage() {
  const lockedModules = useLockedModulesApiData(fallbackLockedModules, lockedModuleIcons)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Locked Advanced Modules</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Advanced capabilities visible but require activation. Human approval required for all activations.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-gold/30 text-gold bg-gold/5">Phase 1 Activation</Badge>
      </div>

      {/* Info Banner */}
      <Card className="border-info/30 bg-info/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-info">Activation Required</p>
              <p className="text-xs text-muted-foreground mt-1">
                These modules are visible to demonstrate platform capabilities but require Advanced Package Activation, 
                infrastructure provisioning, and human approval before they can be enabled. Request activation review through the platform for detailed requirements.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {lockedModules.map((module) => {
          const ModuleIcon = module.icon
          return (
            <Card 
              key={module.id} 
              className="border-border/50 hover:border-muted-foreground/30 transition-colors"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-secondary border border-border flex items-center justify-center">
                      <ModuleIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        {module.name}
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      </CardTitle>
                      <Badge variant="outline" className={cn("text-[9px] mt-1", categoryColors[module.category])}>
                        {module.category}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{module.description}</p>
                
                {/* Requirements */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {module.hardwareRequired && (
                    <Badge variant="outline" className="text-[9px] border-warning/30 text-warning">
                      <HardDrive className="w-2.5 h-2.5 mr-1" />
                      Hardware
                    </Badge>
                  )}
                  {module.gpuRequired && (
                    <Badge variant="outline" className="text-[9px] border-gold/30 text-gold">
                      <Cpu className="w-2.5 h-2.5 mr-1" />
                      GPU
                    </Badge>
                  )}
                  {module.labRequired && (
                    <Badge variant="outline" className="text-[9px] border-cyan/30 text-cyan">
                      <Network className="w-2.5 h-2.5 mr-1" />
                      Lab
                    </Badge>
                  )}
                  {!module.hardwareRequired && !module.gpuRequired && !module.labRequired && (
                    <Badge variant="outline" className="text-[9px] border-success/30 text-success">
                      Software Only
                    </Badge>
                  )}
                </div>

                <p className="text-[10px] text-muted-foreground/70">{module.lockReason}</p>

                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                    <Link href={`/demo/locked-advanced-modules/${module.slug}`}>
                      View Details
                      <ChevronRight className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground">
                    Request Activation Review
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Footer Note */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground text-center">
            All module activations require human approval. AI assistants assist with technical planning but do not make 
            activation approval decisions. Request activation review for timelines and specific requirements.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
