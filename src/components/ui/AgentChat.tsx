'use client';

/**
 * CryptoAgentHQ - Agent Chat Component
 * Chat interface for interacting with agents
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStore } from '@/lib/store/agent-store';
import type { AgentMessage, AgentRole } from '@/types/agent';

const AGENT_EMOJIS: Record<AgentRole, string> = {
    orchestrator: '🎛️',
    'content-strategist': '📊',
    'tweet-optimizer': '✍️',
    'engagement-analyst': '📈',
    'audience-scout': '👥',
    'voice-calibrator': '🎭',
    'schedule-commander': '⏰',
};

export function AgentChat() {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { messages, addMessage, activeAgent, isProcessing, setProcessing } = useAgentStore();

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isProcessing) return;

        // Add user message
        const userMessage: AgentMessage = {
            id: crypto.randomUUID(),
            agentId: 'user',
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };
        addMessage(userMessage);
        setInput('');
        setProcessing(true);

        // Simulate agent response (replace with actual API call)
        setTimeout(() => {
            const agentMessage: AgentMessage = {
                id: crypto.randomUUID(),
                agentId: activeAgent || 'orchestrator',
                role: 'assistant',
                content: `Mesajınız alındı: "${userMessage.content}"\n\nBu demo yanıtıdır. Gerçek implementasyonda Claude API kullanılacak.`,
                timestamp: new Date(),
            };
            addMessage(agentMessage);
            setProcessing(false);
        }, 1500);
    };

    return (
        <>
            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg shadow-purple-500/30 flex items-center justify-center hover:scale-105 transition-transform"
            >
                <span className="text-2xl">{isOpen ? '✕' : '💬'}</span>
            </button>

            {/* Chat Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-24 right-6 z-30 w-[400px] h-[500px] rounded-2xl overflow-hidden bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl shadow-purple-500/10 flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/5 bg-gradient-to-r from-purple-900/50 to-indigo-900/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                                    <span className="text-xl">
                                        {activeAgent ? AGENT_EMOJIS[activeAgent] : '🎛️'}
                                    </span>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-white">
                                        {activeAgent ? activeAgent.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Orchestrator'}
                                    </h3>
                                    <p className="text-xs text-purple-300/70">
                                        {isProcessing ? 'Typing...' : 'Online'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <span className="text-4xl mb-4">🤖</span>
                                    <p className="text-gray-400 text-sm max-w-[250px]">
                                        Merhaba! CryptoAgentHQ Command Center&apos;a hoş geldiniz. Size nasıl yardımcı olabilirim?
                                    </p>
                                </div>
                            ) : (
                                messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        <div
                                            className={`max-w-[80%] rounded-2xl px-4 py-3 ${msg.role === 'user'
                                                    ? 'bg-purple-500 text-white rounded-br-sm'
                                                    : 'bg-white/10 text-white rounded-bl-sm'
                                                }`}
                                        >
                                            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                            <p className="text-[10px] mt-1 opacity-50">
                                                {new Date(msg.timestamp).toLocaleTimeString()}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <form onSubmit={handleSubmit} className="p-4 border-t border-white/5">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Type a message..."
                                    disabled={isProcessing}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors disabled:opacity-50"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || isProcessing}
                                    className="w-12 h-12 rounded-xl bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                                >
                                    {isProcessing ? (
                                        <span className="animate-spin">⏳</span>
                                    ) : (
                                        <span>➤</span>
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
