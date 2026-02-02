/**
 * MSW Server Setup
 * 
 * Creates an MSW server instance for Node.js environments (tests).
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create the server with the default handlers
export const server = setupServer(...handlers);
