/**
 * CryptoAgentHQ - Content Store
 * Zustand store for content management
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { Tweet, Thread, ContentCalendar, ContentPlan, ContentStatus } from '@/types/content';

interface ContentState {
    // State
    drafts: Tweet[];
    scheduled: Tweet[];
    published: Tweet[];
    threads: Thread[];
    calendar: ContentCalendar[];
    plans: ContentPlan[];
    currentDraft: Tweet | null;
    isComposing: boolean;

    // Actions
    setCurrentDraft: (draft: Tweet | null) => void;
    saveDraft: (draft: Tweet) => void;
    updateDraft: (id: string, updates: Partial<Tweet>) => void;
    deleteDraft: (id: string) => void;
    scheduleTweet: (tweet: Tweet, scheduledAt: Date) => void;
    publishTweet: (id: string) => void;
    addThread: (thread: Thread) => void;
    updateThread: (id: string, updates: Partial<Thread>) => void;
    setComposing: (composing: boolean) => void;
    reset: () => void;
}

const initialState = {
    drafts: [],
    scheduled: [],
    published: [],
    threads: [],
    calendar: [],
    plans: [],
    currentDraft: null,
    isComposing: false,
};

export const useContentStore = create<ContentState>()(
    devtools(
        persist(
            (set, get) => ({
                ...initialState,

                setCurrentDraft: (draft) => set({ currentDraft: draft }),

                saveDraft: (draft) =>
                    set((state) => {
                        const exists = state.drafts.find((d) => d.id === draft.id);
                        if (exists) {
                            return {
                                drafts: state.drafts.map((d) =>
                                    d.id === draft.id ? { ...draft, updatedAt: new Date() } : d
                                ),
                            };
                        }
                        return { drafts: [...state.drafts, draft] };
                    }),

                updateDraft: (id, updates) =>
                    set((state) => ({
                        drafts: state.drafts.map((d) =>
                            d.id === id ? { ...d, ...updates, updatedAt: new Date() } : d
                        ),
                    })),

                deleteDraft: (id) =>
                    set((state) => ({
                        drafts: state.drafts.filter((d) => d.id !== id),
                    })),

                scheduleTweet: (tweet, scheduledAt) =>
                    set((state) => ({
                        drafts: state.drafts.filter((d) => d.id !== tweet.id),
                        scheduled: [
                            ...state.scheduled,
                            { ...tweet, status: 'scheduled' as ContentStatus, scheduledAt },
                        ],
                    })),

                publishTweet: (id) =>
                    set((state) => {
                        const tweet =
                            state.scheduled.find((t) => t.id === id) ||
                            state.drafts.find((t) => t.id === id);
                        if (!tweet) return state;

                        return {
                            drafts: state.drafts.filter((d) => d.id !== id),
                            scheduled: state.scheduled.filter((s) => s.id !== id),
                            published: [
                                ...state.published,
                                { ...tweet, status: 'published' as ContentStatus, publishedAt: new Date() },
                            ],
                        };
                    }),

                addThread: (thread) =>
                    set((state) => ({ threads: [...state.threads, thread] })),

                updateThread: (id, updates) =>
                    set((state) => ({
                        threads: state.threads.map((t) =>
                            t.id === id ? { ...t, ...updates } : t
                        ),
                    })),

                setComposing: (composing) => set({ isComposing: composing }),

                reset: () => set(initialState),
            }),
            {
                name: 'crypto-agent-hq-content',
                partialize: (state) => ({
                    drafts: state.drafts,
                    scheduled: state.scheduled,
                    threads: state.threads,
                    plans: state.plans,
                }),
            }
        ),
        { name: 'ContentStore' }
    )
);

// Selectors
export const selectDrafts = (state: ContentState) => state.drafts;
export const selectScheduled = (state: ContentState) => state.scheduled;
export const selectPublished = (state: ContentState) => state.published;
export const selectCurrentDraft = (state: ContentState) => state.currentDraft;
