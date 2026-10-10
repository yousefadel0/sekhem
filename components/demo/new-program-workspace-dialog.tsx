"use client"

import { useState } from "react"
import { CheckCircle, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface NewProgramWorkspaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewProgramWorkspaceDialog({ open, onOpenChange }: NewProgramWorkspaceDialogProps) {
  const [prepared, setPrepared] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setPrepared(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="border-gold/30 text-gold">
              <Lock className="w-3 h-3 mr-1" />
              Enterprise Admin only
            </Badge>
            <Badge variant="outline" className="border-warning/30 text-warning">
              Requires Enterprise Admin permission
            </Badge>
          </div>
          <DialogTitle>New Program Workspace</DialogTitle>
          <DialogDescription>
            Prepare a governed draft workspace for a new open infrastructure program. No backend action or persistence is performed.
          </DialogDescription>
        </DialogHeader>

        {prepared ? (
          <div className="rounded-lg border border-success/30 bg-success/5 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-success">Draft program workspace prepared.</p>
                <p className="text-xs text-muted-foreground mt-1">Enterprise Admin approval required before activation.</p>
                <p className="text-xs text-muted-foreground mt-1">No backend action performed in this UI shell.</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="program-name">Program name</Label>
              <Input id="program-name" placeholder="Regional fabric modernization" className="bg-secondary/30" />
            </div>
            <div className="space-y-2">
              <Label>Target platform</Label>
              <Select>
                <SelectTrigger className="w-full bg-secondary/30">
                  <SelectValue placeholder="Select platform" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sonic">SONiC</SelectItem>
                  <SelectItem value="openwifi">OpenWiFi</SelectItem>
                  <SelectItem value="openlan">OpenLAN</SelectItem>
                  <SelectItem value="sdn-controller">SDN Controller</SelectItem>
                  <SelectItem value="openconfig-gnmi">OpenConfig/gNMI</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="business-objective">Business objective</Label>
              <Textarea id="business-objective" placeholder="Describe the operational outcome this program should support." className="bg-secondary/30 min-h-20" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-classification">Data classification</Label>
              <Input id="data-classification" placeholder="Internal, Confidential, Restricted" className="bg-secondary/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="program-owner">Program owner</Label>
              <Input id="program-owner" placeholder="Program owner name or team" className="bg-secondary/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activation-scope">Activation scope</Label>
              <Input id="activation-scope" placeholder="Phase 1 Activation, Advanced Package, Locked Add-on" className="bg-secondary/30" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="governance-level">Governance level</Label>
              <Input id="governance-level" placeholder="Standard, Enhanced, Regulated" className="bg-secondary/30" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Close
          </Button>
          {!prepared && (
            <Button className="bg-gold text-background hover:bg-gold/90" onClick={() => setPrepared(true)}>
              <Sparkles className="w-4 h-4 mr-2" />
              Create Draft Program Workspace
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
