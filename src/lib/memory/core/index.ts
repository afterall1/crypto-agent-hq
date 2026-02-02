/**
 * CryptoAgentHQ - Core Memory Index
 * @module lib/memory/core
 */

export * from './types';
export {
    createMemoryConfig,
    getMemoryBasePath,
    MEMORY_DIRS,
    MEMORY_FILES,
    TIER_CONFIG,
    IMPORTANCE_WEIGHTS,
    SUMMARIZATION_CONFIG,
    RETRIEVAL_CONFIG,
    PERSISTENCE_CONFIG,
    memoryLogger,
} from './config';
export { MemoryManager, createMemoryManager, getMemoryManager } from './memory-manager';
