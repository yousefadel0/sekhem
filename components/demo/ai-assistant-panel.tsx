"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Bot, 
  X, 
  Send, 
  Sparkles, 
  FileText, 
  AlertTriangle,
  Shield,
  Lightbulb,
  HelpCircle,
  ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"
import { postSekhemApi } from "@/lib/sekhem-api"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  evidence?: string[]
}

interface AiAssistantPanelProps {
  isOpen: boolean
  onClose: () => void
}

const suggestedQuestions = [
  { icon: HelpCircle, text: "Explain this initiative" },
  { icon: Shield, text: "What is the safest execution path?" },
  { icon: AlertTriangle, text: "Why is this blocked?" },
  { icon: FileText, text: "Summarize the evidence" },
  { icon: Lightbulb, text: "Convert this idea into tasks" },
  { icon: Sparkles, text: "What should I approve next?" },
]

export function AiAssistantPanel({ isOpen, onClose }: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return

    // Add user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text
    }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setPending(true)
    const result = await postSekhemApi<{
      status: "REAL_PROVIDER" | "PROVIDER_UNAVAILABLE" | "POLICY_BLOCKED"
      answer: string | null
      providerCallExecuted: boolean
      correlationId: string
    }, { question: string }>("/ai-gateway/assistant", { question: text })
    const response: Message = result?.status === "REAL_PROVIDER" && result.providerCallExecuted && result.answer
      ? { id: `resp-${Date.now()}`, role: "assistant", content: result.answer }
      : { id: `resp-${Date.now()}`, role: "assistant", content: result?.status === "POLICY_BLOCKED" ? "This request was blocked by the AI safety policy." : "The configured AI provider is currently unavailable. No AI answer was generated." }
    setMessages(prev => [...prev, response])
    setPending(false)
  }

  const handleQuestionClick = (question: string) => {
    void handleSendMessage(question)
  }

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-0 h-screen w-96 bg-card border-l border-border shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan/20 border border-cyan/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-cyan" />
          </div>
          <div>
            <h2 className="font-semibold text-foreground">Ask Sekhem Assistant</h2>
            <p className="text-xs text-muted-foreground">AI Technical Assistant</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Safety Notice */}
      <div className="px-4 py-2 bg-cyan/5 border-b border-cyan/20 shrink-0">
        <div className="flex items-center gap-2 text-xs text-cyan">
          <Shield className="w-3 h-3" />
          <span>AI suggests; humans approve. All recommendations are evidence-based.</span>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center py-4">
              Ask questions about initiatives, execution paths, blockers, or evidence.
            </p>
            
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Suggested Questions
              </p>
              {suggestedQuestions.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuestionClick(question.text)}
                  className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/30 border border-border/50 hover:bg-secondary/50 hover:border-cyan/30 transition-all text-left group"
                >
                  <question.icon className="w-4 h-4 text-muted-foreground group-hover:text-cyan shrink-0" />
                  <span className="text-sm text-foreground flex-1">{question.text}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg p-3",
                    message.role === "user"
                      ? "bg-gold/20 border border-gold/30"
                      : "bg-secondary/50 border border-border"
                  )}
                >
                  {message.role === "assistant" && (
                    <div className="flex items-center gap-2 mb-2">
                      <Bot className="w-4 h-4 text-cyan" />
                      <span className="text-xs font-medium text-cyan">Sekhem Assistant</span>
                    </div>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                  
                  {message.evidence && message.evidence.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
                        Evidence Sources
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {message.evidence.map((source, idx) => (
                          <Badge 
                            key={idx} 
                            variant="outline" 
                            className="text-[10px] border-cyan/30 text-cyan bg-cyan/5"
                          >
                            <FileText className="w-3 h-3 mr-1" />
                            {source}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border shrink-0">
        <form 
          onSubmit={(e) => {
            e.preventDefault()
            void handleSendMessage(input)
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this initiative..."
            className="flex-1 bg-secondary/30"
          />
          <Button type="submit" size="icon" disabled={pending} className="bg-cyan text-background hover:bg-cyan/90 shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          Human approval required for all execution decisions
        </p>
      </div>
    </div>
  )
}

// Floating trigger button component
export function AiAssistantTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-cyan text-background hover:bg-cyan/90 shadow-lg shadow-cyan/20 z-40"
    >
      <Bot className="w-6 h-6" />
    </Button>
  )
}
