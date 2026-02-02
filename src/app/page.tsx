'use client';

/**
 * CryptoAgentHQ - Main Dashboard Page
 * WebGL Command Center with Agent Interface
 */

import { Suspense, lazy } from 'react';
import { AgentChat } from '@/components/ui/AgentChat';
import { Sidebar } from '@/components/ui/Sidebar';
import { useAgentStore } from '@/lib/store/agent-store';

// Lazy load 3D components for better performance
const CommandCenter = lazy(() =>
  import('@/components/3d/CommandCenter').then((m) => ({ default: m.CommandCenter }))
);

// 3D Loading fallback
function Scene3DFallback() {
  return (
    <div className="absolute inset-0 bg-[#050510] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
        <p className="text-purple-300/70 text-sm">Loading Command Center...</p>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { activeAgent, isProcessing } = useAgentStore();

  return (
    <main className="relative min-h-screen bg-[#050510] overflow-hidden">
      {/* 3D Background */}
      <Suspense fallback={<Scene3DFallback />}>
        <CommandCenter />
      </Suspense>

      {/* UI Overlay Layer */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="fixed top-0 left-0 right-0 h-16 flex items-center justify-between px-6 backdrop-blur-md bg-black/30 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <span className="text-xl">🚀</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">CryptoAgentHQ</h1>
              <p className="text-xs text-purple-300/70">AI Agent Command Center</p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-4">
            {isProcessing && (
              <div className="flex items-center gap-2 text-sm text-purple-300">
                <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                Processing...
              </div>
            )}
            {activeAgent && (
              <div className="px-3 py-1.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm">
                Active: {activeAgent}
              </div>
            )}
          </div>
        </header>

        {/* Sidebar */}
        <Sidebar />

        {/* Agent Chat Panel */}
        <AgentChat />
      </div>

      {/* iOS Safe Area Padding */}
      <div className="fixed bottom-0 left-0 right-0 h-[env(safe-area-inset-bottom)] bg-black/50" />
    </main>
  );
}
