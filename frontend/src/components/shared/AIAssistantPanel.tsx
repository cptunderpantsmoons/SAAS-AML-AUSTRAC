'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Send, Bot, User, Sparkles, ChevronRight, Loader2,
  Shield, FileSearch, AlertTriangle, Scale, BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAIChat } from '@/hooks/useApi';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface AIAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context?: string;
}

const SUGGESTED_PROMPTS = [
  { icon: Shield, label: 'Explain SMR filing requirements', prompt: 'What are the requirements for filing a Suspicious Matter Report (SMR) under the AML/CTF Act?' },
  { icon: FileSearch, label: 'KYC verification steps', prompt: 'What are the standard KYC verification steps required for new client onboarding in Australia?' },
  { icon: AlertTriangle, label: 'Threshold transaction rules', prompt: 'What are the reporting obligations for threshold transactions (TTR) and what is the current threshold amount?' },
  { icon: Scale, label: 'PEP due diligence', prompt: 'What enhanced due diligence measures are required for Politically Exposed Persons (PEPs) under Australian regulations?' },
  { icon: BookOpen, label: 'UBO identification', prompt: 'What are the requirements for identifying Ultimate Beneficial Owners (UBOs) under the AML/CTF Act?' },
];

export function AIAssistantPanel({ isOpen, onClose, context }: AIAssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const aiChat = useAIChat();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = async (messageText?: string) => {
    const text = messageText ?? input.trim();
    if (!text) return;

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const result = await aiChat.mutateAsync({
        message: text,
        context,
        history,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: result.response,
        timestamp: result.timestamp,
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again or consult with your compliance officer for assistance.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%', opacity: 0.5 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full sm:w-[440px] bg-background border-l border-border shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-gradient-to-r from-violet-50 via-purple-50 to-fuchsia-50 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-200 dark:shadow-violet-900/50">
                    <Sparkles className="h-5 w-5 text-white" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 bg-emerald-500 rounded-full ring-2 ring-background" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-foreground">Compliance AI</h2>
                  <p className="text-xs text-muted-foreground">AML/CTF Expert Assistant</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 border-violet-200 dark:border-violet-800 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30">
                  AUSTRAC
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-white/60 dark:hover:bg-background/60"
                  onClick={onClose}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Messages area */}
            <ScrollArea className="flex-1">
              <div ref={scrollRef} className="p-5 space-y-4">
                {messages.length === 0 ? (
                  /* Welcome state */
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-center py-6"
                  >
                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/30 mx-auto flex items-center justify-center mb-4">
                      <Bot className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                    </div>
                    <h3 className="text-base font-semibold mb-1">Compliance AI Assistant</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-[300px] mx-auto">
                      Ask me about AUSTRAC regulations, AML/CTF compliance, reporting requirements, or risk assessment.
                    </p>

                    {/* Suggested prompts */}
                    <div className="space-y-2 text-left">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Suggested Questions</p>
                      {SUGGESTED_PROMPTS.map((prompt, idx) => (
                        <motion.button
                          key={idx}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 + idx * 0.05, duration: 0.25 }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:bg-muted/50 transition-all duration-200 group border border-transparent hover:border-border"
                          onClick={() => handleSend(prompt.prompt)}
                        >
                          <div className="h-8 w-8 rounded-lg bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center shrink-0 group-hover:bg-violet-100 dark:group-hover:bg-violet-900/40 transition-colors">
                            <prompt.icon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">{prompt.label}</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-violet-500 transition-colors" />
                        </motion.button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  /* Chat messages */
                  messages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                        msg.role === 'assistant'
                          ? 'bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}>
                        {msg.role === 'assistant'
                          ? <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          : <User className="h-4 w-4 text-slate-600 dark:text-slate-400" />
                        }
                      </div>
                      <div className={`flex-1 max-w-[85%] ${msg.role === 'user' ? 'text-right' : ''}`}>
                        <div className={`inline-block text-left rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === 'assistant'
                            ? 'bg-muted/60 border border-border/50'
                            : 'bg-violet-600 text-white'
                        }`}>
                          {msg.content}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 px-1">
                          {new Date(msg.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </motion.div>
                  ))
                )}

                {/* Loading indicator */}
                {aiChat.isPending && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-3"
                  >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-100 to-purple-100 dark:from-violet-900/40 dark:to-purple-900/40 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="bg-muted/60 border border-border/50 rounded-2xl px-4 py-3 flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                      <span className="text-sm text-muted-foreground">Analyzing compliance query...</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </ScrollArea>

            {/* Input area */}
            <div className="border-t border-border p-4 bg-muted/20">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about AML/CTF compliance..."
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 dark:focus:ring-violet-700 transition-shadow min-h-[48px] max-h-[120px]"
                    rows={1}
                    disabled={aiChat.isPending}
                  />
                </div>
                <Button
                  size="icon"
                  className="h-12 w-12 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/50 transition-all duration-200 shrink-0 disabled:opacity-50"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || aiChat.isPending}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                AI responses are for guidance only. Always consult a compliance officer for final decisions.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
