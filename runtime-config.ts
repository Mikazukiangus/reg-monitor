// Server/build entry point only. Never import this module from src/: it holds
// database credentials, the cron secret and the email API key.
import dotenv from 'dotenv';
import { createConfig } from './config.js';

// Load before constructing the singleton, including when db.ts is imported
// directly. Existing process settings win over the local .env file.
dotenv.config({ quiet: true });

export const config = createConfig(process.env);
