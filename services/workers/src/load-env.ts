// Side-effect import: must be the FIRST import of every entry point, because some modules read
// process.env at load time (e.g. MARKET_API_BASE in sync-market.ts).
import { loadRepoEnv } from "./env.js";

loadRepoEnv();
