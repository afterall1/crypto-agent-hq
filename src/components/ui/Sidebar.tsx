'use client';

/**
 * CryptoAgentHQ - Sidebar Component
 * Navigation and quick actions
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAgentStore } from '@/lib/store/agent-store';
import { useContentStore } from '@/lib/store/content-store';

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: '🎛️' },
    { id: 'compose', label: 'Compose', icon: '✍️' },
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'agents', label: 'Agents', icon: '🤖' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export function Sidebar() {
    const [isExpanded, setIsExpanded] = useState(false);
    const [activeItem, setActiveItem] = useState('dashboard');
    const { tasks } = useAgentStore();
    const { drafts, scheduled } = useContentStore();

    const pendingTasks = tasks.filter((t) => t.status === 'pending' || t.status === 'in-progress').length;

    return (
        <motion.aside
            className="fixed left-0 top-16 bottom-0 z-20 flex flex-col bg-black/40 backdrop-blur-xl border-r border-white/5"
            initial={{ width: 72 }}
            animate={{ width: isExpanded ? 240 : 72 }}
            transition={{ duration: 0.2 }}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {/* Navigation Items */}
            <nav className="flex-1 py-4 px-3 space-y-2">
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveItem(item.id)}
                        className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all
              ${activeItem === item.id
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }
            `}
                    >
                        <span className="text-xl flex-shrink-0">{item.icon}</span>
                        <AnimatePresence>
                            {isExpanded && (
                                <motion.span
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -10 }}
                                    className="text-sm font-medium whitespace-nowrap"
                                >
                                    {item.label}
                                </motion.span>
                            )}
                        </AnimatePresence>

                        {/* Badge for Compose */}
                        {item.id === 'compose' && drafts.length > 0 && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center">
                                {drafts.length}
                            </span>
                        )}

                        {/* Badge for Schedule */}
                        {item.id === 'schedule' && scheduled.length > 0 && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                                {scheduled.length}
                            </span>
                        )}
                    </button>
                ))}
            </nav>

            {/* Quick Stats */}
            <div className="p-3 border-t border-white/5">
                <AnimatePresence>
                    {isExpanded ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="space-y-2"
                        >
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Pending Tasks</span>
                                <span className="text-purple-300">{pendingTasks}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Drafts</span>
                                <span className="text-orange-300">{drafts.length}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-500">Scheduled</span>
                                <span className="text-blue-300">{scheduled.length}</span>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col items-center gap-1"
                        >
                            {pendingTasks > 0 && (
                                <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.aside>
    );
}
