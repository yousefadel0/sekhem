"use client"

import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WalkthroughOverlayProps {
  currentStep: number
  totalSteps: number
  stepTitle: string
  stepDescription: string
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export function WalkthroughOverlay({
  currentStep,
  totalSteps,
  stepTitle,
  stepDescription,
  onNext,
  onPrev,
  onClose
}: WalkthroughOverlayProps) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 ml-32">
      <div className="bg-card/95 backdrop-blur-xl border border-gold/30 rounded-2xl shadow-2xl shadow-gold/10 p-5 min-w-[400px] max-w-[500px]">
        {/* Progress Bar */}
        <div className="flex items-center gap-2 mb-4">
          {Array.from({ length: totalSteps }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-all duration-300",
                index < currentStep ? "bg-gold" : "bg-border"
              )}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-gold">Step {currentStep} of {totalSteps}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 -mr-2 -mt-2"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">{stepTitle}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{stepDescription}</p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={onPrev}
            disabled={currentStep === 1}
            className="gap-1 border-border hover:border-gold/50 hover:text-gold disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <Button
            size="sm"
            onClick={onNext}
            className="gap-1 bg-gold text-background hover:bg-gold/90"
          >
            {currentStep === totalSteps ? "Finish" : "Next"}
            {currentStep !== totalSteps && <ChevronRight className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
