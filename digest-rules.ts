// Rules for the daily email digest (see digest.ts). Same format as the Alert
// Rules tab: a notice matches when it is from a listed regulator (matched
// against names such as "MAS", "SFC", "US SEC"), meets the impact score, and
// mentions one of the keywords. The "Copy rules" button on the Alert Rules tab
// copies rules made there in this format.
import type { CustomAlertRule } from './src/types/regulatory.js';
import { DEFAULT_RULES } from './src/lib/alertRules.js';

export const DIGEST_RULES: CustomAlertRule[] = DEFAULT_RULES;
