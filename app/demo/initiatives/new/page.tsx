"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { 
  Lightbulb, 
  Radar, 
  CheckCircle, 
  Clock, 
  FileSearch, 
  ArrowRight,
  Upload,
  AlertTriangle,
  Shield
} from "lucide-react"

export default function NewInitiativeIntakePage() {
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState({
    title: "",
    problem: "",
    platform: "",
    businessReason: "",
    urgency: "",
    dataClassification: "",
    desiredOutcome: ""
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  const handleReset = () => {
    setSubmitted(false)
    setFormData({
      title: "",
      problem: "",
      platform: "",
      businessReason: "",
      urgency: "",
      dataClassification: "",
      desiredOutcome: ""
    })
  }

  if (submitted) {
    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-success" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Initiative Submitted</h1>
              <p className="text-sm text-muted-foreground mt-1">Your initiative has been received and queued for R&D Radar study.</p>
            </div>
          </div>
          <Badge variant="outline" className="border-cyan/30 text-cyan bg-cyan/5">Phase 1 Activation</Badge>
        </div>

        {/* Result Card */}
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-success/20 border border-success/30 flex items-center justify-center shrink-0">
                <Radar className="w-6 h-6 text-success" />
              </div>
              <div className="space-y-3 flex-1">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{formData.title || "New Initiative"}</h3>
                  <p className="text-sm text-muted-foreground">Initiative received and pending R&D study</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-sm text-foreground">Initiative received</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan" />
                    <span className="text-sm text-foreground">R&D study pending</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileSearch className="w-4 h-4 text-warning" />
                    <span className="text-sm text-foreground">Evidence scan required</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-gold" />
                    <span className="text-sm text-foreground">Human review for high-risk paths</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Suggested Next Step */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ArrowRight className="w-5 h-5 text-cyan" />
              Suggested Next Step
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The R&D Radar will analyze your idea against existing knowledge, open-source intelligence, 
              and your organization&apos;s technical context. Once the study is complete, you will receive 
              a recommendation for how to proceed.
            </p>
            <div className="flex items-center gap-3">
              <Button className="bg-cyan text-background hover:bg-cyan/90 gap-2">
                <Radar className="w-4 h-4" />
                Run Discovery
              </Button>
              <Button variant="outline" onClick={handleReset}>
                Submit Another Initiative
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Human Review Notice */}
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Human Review Required for High-Risk Paths</p>
                <p className="text-xs text-muted-foreground mt-1">
                  If the R&D Radar identifies this initiative as involving high-risk technical areas 
                  (security, compliance, critical infrastructure), it will be flagged for mandatory 
                  human engineering review before any execution path is recommended.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Lightbulb className="w-6 h-6 text-cyan" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">New Initiative Intake</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Start with an idea, requirement, or problem. R&D Radar can study it and suggest a safe execution path.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-cyan/30 text-cyan bg-cyan/5">Phase 1 Activation</Badge>
      </div>

      {/* Info Card */}
      <Card className="border-cyan/30 bg-cyan/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Radar className="w-5 h-5 text-cyan shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-cyan">How This Works</p>
              <p className="text-xs text-muted-foreground mt-1">
                Submit your idea, requirement, or problem statement below. The R&D Radar will analyze it against 
                available knowledge, open-source intelligence, and your technical context to provide 
                evidence-based recommendations and suggest a safe execution path.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Initiative Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Idea Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Initiative Title</Label>
              <Input
                id="title"
                placeholder="Brief title for your idea, requirement, or problem"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="bg-secondary/30"
              />
            </div>

            {/* Problem / Goal */}
            <div className="space-y-2">
              <Label htmlFor="problem">Problem / Goal</Label>
              <Textarea
                id="problem"
                placeholder="Describe the problem you're trying to solve or the goal you want to achieve..."
                value={formData.problem}
                onChange={(e) => setFormData({ ...formData, problem: e.target.value })}
                className="bg-secondary/30 min-h-[100px]"
              />
            </div>

            {/* Target Platform */}
            <div className="space-y-2">
              <Label htmlFor="platform">Target Platform</Label>
              <Select 
                value={formData.platform} 
                onValueChange={(value) => setFormData({ ...formData, platform: value })}
              >
                <SelectTrigger id="platform" className="bg-secondary/30">
                  <SelectValue placeholder="Select target platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sonic">SONiC</SelectItem>
                  <SelectItem value="openwifi">OpenWiFi</SelectItem>
                  <SelectItem value="openlan">OpenLAN</SelectItem>
                  <SelectItem value="sdn-controller">SDN Controller</SelectItem>
                  <SelectItem value="openconfig-gnmi">OpenConfig / gNMI</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Business Reason */}
            <div className="space-y-2">
              <Label htmlFor="businessReason">Business Reason</Label>
              <Textarea
                id="businessReason"
                placeholder="Why is this important for your organization?"
                value={formData.businessReason}
                onChange={(e) => setFormData({ ...formData, businessReason: e.target.value })}
                className="bg-secondary/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Urgency */}
              <div className="space-y-2">
                <Label htmlFor="urgency">Urgency</Label>
                <Select 
                  value={formData.urgency} 
                  onValueChange={(value) => setFormData({ ...formData, urgency: value })}
                >
                  <SelectTrigger id="urgency" className="bg-secondary/30">
                    <SelectValue placeholder="Select urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical - Blocking operations</SelectItem>
                    <SelectItem value="high">High - Needed soon</SelectItem>
                    <SelectItem value="medium">Medium - Planned improvement</SelectItem>
                    <SelectItem value="low">Low - Nice to have</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Data Classification */}
              <div className="space-y-2">
                <Label htmlFor="dataClassification">Data Classification</Label>
                <Select 
                  value={formData.dataClassification} 
                  onValueChange={(value) => setFormData({ ...formData, dataClassification: value })}
                >
                  <SelectTrigger id="dataClassification" className="bg-secondary/30">
                    <SelectValue placeholder="Select classification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public</SelectItem>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="confidential">Confidential</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Desired Outcome */}
            <div className="space-y-2">
              <Label htmlFor="desiredOutcome">Desired Outcome</Label>
              <Textarea
                id="desiredOutcome"
                placeholder="What does success look like? What should the end result achieve?"
                value={formData.desiredOutcome}
                onChange={(e) => setFormData({ ...formData, desiredOutcome: e.target.value })}
                className="bg-secondary/30"
              />
            </div>

            {/* Attach Evidence */}
            <div className="space-y-2">
              <Label>Attach Evidence (Optional)</Label>
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-cyan/50 transition-colors cursor-pointer">
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Drag and drop files here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports documents, images, and technical specifications
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <Button type="submit" className="bg-cyan text-background hover:bg-cyan/90 gap-2">
                <Radar className="w-4 h-4" />
                Ask R&D Radar to Study This Initiative
              </Button>
              <p className="text-xs text-muted-foreground">
                AI will analyze and provide evidence-based recommendations. Human approval required for execution.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
