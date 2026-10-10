import { notFound } from "next/navigation"
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
  ChevronLeft,
  AlertCircle,
  Building,
  Key,
  CheckCircle,
  XCircle,
  HardDrive,
  Network,
  FileCheck,
  Users
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ModuleDetail {
  id: string
  name: string
  slug: string
  description: string
  fullDescription: string
  icon: React.ElementType
  category: "infrastructure" | "compute" | "integration" | "security" | "support"
  lockReason: string
  whatItDoes: string[]
  whyLocked: string
  requirements: {
    infrastructure: string[]
    approvals: string[]
    activations: string[]
  }
  activationPath: {
    steps: string[]
    contactType: string
    estimatedTime: string
  }
  hardwareRequired: boolean
  gpuRequired: boolean
  labRequired: boolean
}

const moduleDetails: Record<string, ModuleDetail> = {
  "deep-nos-implementation": {
    id: "deep-nos",
    name: "Deep NOS Implementation",
    slug: "deep-nos-implementation",
    description: "Full network operating system integration with production deployment support.",
    fullDescription: "Deep NOS Implementation provides full production-grade integration with SONiC, FRR routing stack, SWSS (Switch State Service), SAI (Switch Abstraction Interface), and platform-specific drivers. This module enables direct code contributions, custom feature development, and production deployment support for sovereign SONiC deployments.",
    icon: Server,
    category: "infrastructure",
    lockReason: "Requires Advanced Package Activation and dedicated infrastructure",
    whatItDoes: [
      "Direct integration with SONiC core components",
      "Custom FRR routing protocol extensions",
      "Platform driver development and validation",
      "Production deployment automation",
      "Full NOS lifecycle management",
      "Custom ASIC feature enablement"
    ],
    whyLocked: "Deep NOS Implementation requires direct access to production network infrastructure and core operating system components. This level of access requires dedicated support agreements, infrastructure provisioning, and Advanced Package Activation to ensure proper governance and support coverage.",
    requirements: {
      infrastructure: [
        "Dedicated SONiC deployment environment",
        "Platform driver access and documentation",
        "Test lab with target hardware",
        "CI/CD pipeline integration"
      ],
      approvals: [
        "Technical architecture review",
        "Security compliance assessment",
        "Production deployment authorization",
        "Change management process approval"
      ],
      activations: [
        "Advanced Package Activation",
        "Production support agreement",
        "Source code access agreement",
        "Platform vendor partnership"
      ]
    },
    activationPath: {
      steps: [
        "Request Activation Review for Advanced Package",
        "Complete technical architecture review",
        "Sign production support agreement",
        "Provision dedicated infrastructure",
        "Complete security compliance assessment",
        "Enable module access"
      ],
      contactType: "Activation Review Owner",
      estimatedTime: "4-6 weeks"
    },
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true
  },
  "hardware-lab-automation": {
    id: "hardware-lab",
    name: "Hardware Lab Automation",
    slug: "hardware-lab-automation",
    description: "Automated hardware-in-loop testing with physical switch validation.",
    fullDescription: "Hardware Lab Automation enables automated testing on physical network switches and infrastructure. This module provides hardware-in-loop validation, performance benchmarking, failure injection testing, and continuous integration with physical lab environments for sovereign SONiC deployments.",
    icon: Cpu,
    category: "infrastructure",
    lockReason: "Requires physical lab hardware and dedicated infrastructure",
    whatItDoes: [
      "Automated physical switch testing",
      "Hardware-in-loop validation workflows",
      "Performance benchmarking automation",
      "Failure injection and recovery testing",
      "Multi-vendor hardware compatibility testing",
      "Continuous lab integration"
    ],
    whyLocked: "Hardware Lab Automation requires physical network equipment, dedicated lab space, and specialized infrastructure. Access requires lab provisioning, equipment agreements, and dedicated support to manage physical infrastructure safely.",
    requirements: {
      infrastructure: [
        "Physical lab environment (switches, servers, cabling)",
        "Hardware-in-loop test infrastructure",
        "Network switch access (SONiC-compatible)",
        "Lab management system integration"
      ],
      approvals: [
        "Lab access authorization",
        "Equipment safety certification",
        "Remote access security approval",
        "Lab operations training completion"
      ],
      activations: [
        "Lab environment agreement",
        "Hardware access license",
        "Extended support coverage",
        "Equipment maintenance agreement"
      ]
    },
    activationPath: {
      steps: [
        "Request lab environment provisioning",
        "Complete equipment safety certification",
        "Sign lab operations agreement",
        "Configure remote access security",
        "Complete lab operations training",
        "Enable module access"
      ],
      contactType: "Lab Operations Team",
      estimatedTime: "6-8 weeks"
    },
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true
  },
  "self-hosted-code-runner": {
    id: "self-hosted-runner",
    name: "Self-hosted Code Runner",
    slug: "self-hosted-code-runner",
    description: "Run AI code generation on your own infrastructure with full data sovereignty.",
    fullDescription: "Self-hosted Code Runner enables you to run AI code generation, validation, and testing on your own infrastructure. This module provides complete data sovereignty, air-gapped operation capability, and full control over compute resources for sensitive sovereign deployments.",
    icon: Code,
    category: "compute",
    lockReason: "Requires dedicated compute infrastructure and security configuration",
    whatItDoes: [
      "AI code generation on private infrastructure",
      "Complete data sovereignty and privacy",
      "Air-gapped operation capability",
      "Custom compute resource allocation",
      "Private model deployment",
      "Isolated execution environments"
    ],
    whyLocked: "Self-hosted Code Runner requires dedicated compute infrastructure, container orchestration, and security configuration. This module is designed for organizations requiring complete data sovereignty and cannot share compute resources with the managed service.",
    requirements: {
      infrastructure: [
        "Dedicated compute cluster (16+ cores, 64GB+ RAM)",
        "Container orchestration platform (Kubernetes recommended)",
        "Network isolation and firewall configuration",
        "Persistent storage (500GB+ SSD)"
      ],
      approvals: [
        "Security architecture review",
        "Network isolation approval",
        "Data residency compliance verification",
        "Operations readiness assessment"
      ],
      activations: [
        "Self-hosted deployment license",
        "Private infrastructure agreement",
        "Extended support coverage",
        "Update and maintenance package"
      ]
    },
    activationPath: {
      steps: [
        "Configure compute infrastructure",
        "Complete security architecture review",
        "Sign self-hosted deployment agreement",
        "Deploy runner components",
        "Configure network isolation",
        "Enable module access"
      ],
      contactType: "Infrastructure Team",
      estimatedTime: "3-4 weeks"
    },
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: false
  },
  "local-llm-server": {
    id: "local-llm",
    name: "Local LLM Server",
    slug: "local-llm-server",
    description: "Deploy AI models locally with GPU acceleration for complete data privacy.",
    fullDescription: "Local LLM Server enables deployment of AI language models on your own GPU-accelerated infrastructure. This module provides complete data privacy, offline operation capability, and customizable model configurations for sensitive network automation use cases.",
    icon: BrainCircuit,
    category: "compute",
    lockReason: "Requires GPU hardware and local model deployment infrastructure",
    whatItDoes: [
      "Local AI model deployment",
      "GPU-accelerated inference",
      "Complete data privacy and offline operation",
      "Custom model fine-tuning",
      "Low-latency local inference",
      "Private training data handling"
    ],
    whyLocked: "Local LLM Server requires significant GPU compute resources and specialized infrastructure for model serving. This module is designed for organizations requiring complete AI privacy and cannot rely on cloud-based inference.",
    requirements: {
      infrastructure: [
        "GPU compute resources (NVIDIA A100 or equivalent)",
        "Local model storage (500GB+ NVMe SSD)",
        "Model serving infrastructure (vLLM, TensorRT)",
        "High-bandwidth network connectivity"
      ],
      approvals: [
        "GPU infrastructure approval",
        "Model deployment authorization",
        "Data privacy compliance verification",
        "Capacity planning approval"
      ],
      activations: [
        "Local deployment license",
        "Model access agreement",
        "GPU infrastructure license",
        "Offline operation package"
      ]
    },
    activationPath: {
      steps: [
        "Provision GPU infrastructure",
        "Complete model deployment training",
        "Sign local deployment agreement",
        "Deploy model serving stack",
        "Configure inference endpoints",
        "Enable module access"
      ],
      contactType: "AI Platform Team",
      estimatedTime: "4-6 weeks"
    },
    hardwareRequired: true,
    gpuRequired: true,
    labRequired: false
  },
  "openwifi-extension": {
    id: "openwifi-extension",
    name: "OpenWiFi Extension",
    slug: "openwifi-extension",
    description: "Extended validation for OpenWiFi access point deployments.",
    fullDescription: "OpenWiFi Extension provides comprehensive validation, automation, and integration capabilities for OpenWiFi access point deployments. This module enables converged wired/wireless validation, AP provisioning automation, and seamless SONiC integration for sovereign wireless deployments.",
    icon: Wifi,
    category: "integration",
    lockReason: "Requires OpenWiFi infrastructure and integration license",
    whatItDoes: [
      "OpenWiFi access point validation",
      "Converged wired/wireless testing",
      "AP provisioning automation",
      "Wireless-to-wired integration validation",
      "Performance benchmarking for wireless",
      "Multi-vendor AP compatibility testing"
    ],
    whyLocked: "OpenWiFi Extension requires OpenWiFi infrastructure, AP provisioning access, and integration expertise. This module extends the core platform to wireless domains and requires dedicated wireless environment configuration.",
    requirements: {
      infrastructure: [
        "OpenWiFi deployment environment",
        "Access point provisioning access",
        "Wireless test environment",
        "OpenWiFi controller access"
      ],
      approvals: [
        "Wireless architecture review",
        "AP access authorization",
        "Integration test approval",
        "Wireless security compliance"
      ],
      activations: [
        "OpenWiFi integration license",
        "Wireless extension package",
        "AP vendor partnership",
        "Extended wireless support"
      ]
    },
    activationPath: {
      steps: [
        "Request OpenWiFi extension activation",
        "Configure wireless test environment",
        "Complete integration training",
        "Sign wireless extension agreement",
        "Deploy wireless validation components",
        "Enable module access"
      ],
      contactType: "Wireless Integration Team",
      estimatedTime: "3-4 weeks"
    },
    hardwareRequired: true,
    gpuRequired: false,
    labRequired: true
  },
  "advanced-security-compliance": {
    id: "advanced-security",
    name: "Advanced Security Compliance",
    slug: "advanced-security-compliance",
    description: "Enhanced security scanning and compliance reporting for regulated environments.",
    fullDescription: "Advanced Security Compliance provides enhanced security scanning, compliance framework integration, and audit trail capabilities for regulated environments. This module enables compliance reporting for standards like SOC 2, ISO 27001, and industry-specific regulations.",
    icon: Shield,
    category: "security",
    lockReason: "Requires compliance framework configuration and security team approval",
    whatItDoes: [
      "Enhanced vulnerability scanning",
      "Compliance framework integration (SOC 2, ISO 27001)",
      "Automated compliance reporting",
      "Extended audit trail capabilities",
      "Policy enforcement automation",
      "Regulatory evidence collection"
    ],
    whyLocked: "Advanced Security Compliance requires compliance framework selection, security team certification, and regulatory approval documentation. This module handles sensitive compliance data and requires proper governance configuration.",
    requirements: {
      infrastructure: [
        "Compliance management system integration",
        "Audit log storage and retention",
        "Security information event management (SIEM)",
        "Evidence repository"
      ],
      approvals: [
        "Compliance framework selection",
        "Security team certification",
        "Regulatory approval documentation",
        "Audit readiness assessment"
      ],
      activations: [
        "Compliance module license",
        "Regulatory reporting package",
        "Extended audit coverage",
        "Compliance support agreement"
      ]
    },
    activationPath: {
      steps: [
        "Select compliance frameworks",
        "Complete security team certification",
        "Configure audit integration",
        "Sign compliance agreement",
        "Deploy compliance components",
        "Enable module access"
      ],
      contactType: "Security Compliance Team",
      estimatedTime: "4-6 weeks"
    },
    hardwareRequired: false,
    gpuRequired: false,
    labRequired: false
  },
  "annual-update-package": {
    id: "annual-update",
    name: "Annual Update Package",
    slug: "annual-update-package",
    description: "Priority access to new features and continuous platform updates.",
    fullDescription: "Annual Update Package provides priority access to new platform features, extended support coverage, and continuous updates. This package ensures your deployment stays current with the latest capabilities, security patches, and performance improvements.",
    icon: Calendar,
    category: "support",
    lockReason: "Requires active support subscription",
    whatItDoes: [
      "Priority access to new features",
      "Extended support coverage",
      "Continuous platform updates",
      "Security patch priority",
      "Feature request prioritization",
      "Dedicated support channel"
    ],
    whyLocked: "Annual Update Package requires an active support subscription and update channel configuration. This ensures proper change management and staging validation before production updates.",
    requirements: {
      infrastructure: [
        "Staging environment for updates",
        "Update channel configuration",
        "Rollback capability",
        "Change management integration"
      ],
      approvals: [
        "Change management process approval",
        "Update window scheduling",
        "Rollback plan verification",
        "Stakeholder notification setup"
      ],
      activations: [
        "Active support subscription",
        "Update package license",
        "Priority support tier",
        "Extended maintenance coverage"
      ]
    },
    activationPath: {
      steps: [
        "Request Annual Update activation review",
        "Configure staging environment",
        "Set up update channels",
        "Sign support agreement",
        "Configure change management",
        "Enable module access"
      ],
      contactType: "Support Team",
      estimatedTime: "1-2 weeks"
    },
    hardwareRequired: false,
    gpuRequired: false,
    labRequired: false
  }
}

export default async function LockedModuleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const moduleData = moduleDetails[slug]

  if (!moduleData) {
    notFound()
  }

  const ModuleIcon = moduleData.icon

  return (
    <div className="p-6 space-y-6">
      {/* Back Link */}
      <Link 
        href="/demo/locked-advanced-modules"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Back to Advanced Modules
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-secondary border border-border flex items-center justify-center">
            <ModuleIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{moduleData.name}</h1>
              <Lock className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mt-1">{moduleData.description}</p>
          </div>
        </div>
        <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
          Locked - Advanced Package
        </Badge>
      </div>

      {/* Requirements Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        {moduleData.hardwareRequired && (
          <Badge variant="outline" className="border-warning/30 text-warning">
            <HardDrive className="w-3 h-3 mr-1" />
            Hardware Required
          </Badge>
        )}
        {moduleData.gpuRequired && (
          <Badge variant="outline" className="border-gold/30 text-gold">
            <Cpu className="w-3 h-3 mr-1" />
            GPU Required
          </Badge>
        )}
        {moduleData.labRequired && (
          <Badge variant="outline" className="border-cyan/30 text-cyan">
            <Network className="w-3 h-3 mr-1" />
            Lab Environment Required
          </Badge>
        )}
      </div>

      {/* Lock Status Banner */}
      <Card className="border-warning/30 bg-warning/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">This Module is Locked</p>
              <p className="text-xs text-muted-foreground mt-1">{moduleData.lockReason}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Description */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">About This Module</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{moduleData.fullDescription}</p>
        </CardContent>
      </Card>

      {/* What It Does */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-success" />
            What This Module Does
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {moduleData.whatItDoes.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success shrink-0 mt-0.5" />
                <span className="text-muted-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Why Locked */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-warning" />
            Why This Module is Locked
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{moduleData.whyLocked}</p>
        </CardContent>
      </Card>

      {/* Requirements */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-cyan" />
              Infrastructure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {moduleData.requirements.infrastructure.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-gold" />
              Approvals Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {moduleData.requirements.approvals.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-success" />
              Activation Requirements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {moduleData.requirements.activations.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Activation Path */}
      <Card className="border-gold/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="w-4 h-4 text-gold" />
            Activation Path
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-3 bg-gold/10 rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Activation Owner</p>
              <p className="text-sm font-medium">{moduleData.activationPath.contactType}</p>
            </div>
            <div className="border-l border-border pl-4">
              <p className="text-xs text-muted-foreground">Estimated Time</p>
              <p className="text-sm font-medium">{moduleData.activationPath.estimatedTime}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-3">Activation Steps</p>
            <div className="space-y-2">
              {moduleData.activationPath.steps.map((step, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
                  <div className="w-6 h-6 rounded-full bg-gold/20 border border-gold/30 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-gold">{idx + 1}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{step}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activation CTA */}
      <Card className="border-gold/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-gold/20 border border-gold/30 flex items-center justify-center">
                <Building className="w-6 h-6 text-gold" />
              </div>
              <div>
                <p className="text-sm font-medium">Ready to Activate {moduleData.name}?</p>
                <p className="text-xs text-muted-foreground">
                  Request activation review with {moduleData.activationPath.contactType}
                </p>
              </div>
            </div>
            <Button className="bg-gold text-gold-foreground hover:bg-gold/90" disabled>
              <Users className="w-4 h-4 mr-2" />
              Request Activation Review
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Governance Notice */}
      <Card className="border-border bg-secondary/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Module Activation Governance</p>
              <p className="text-xs text-muted-foreground mt-1">
                This module requires explicit Advanced Package Activation and infrastructure provisioning.
                AI assistants cannot bypass module locks or activate advanced capabilities without authorized human approval.
                All activation requests are subject to review and approval processes.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
