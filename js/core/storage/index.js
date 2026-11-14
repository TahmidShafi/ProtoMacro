/* ============================================================
   ProtoMacro — core/storage/index.js
   Storage facade. Feature modules NEVER touch localStorage —
   they call saveState()/STATE from state.js, which routes here.
   ============================================================ */

import { localStorageProvider } from './local.js';

export const getProvider = () => localStorageProvider;
export const localProvider = localStorageProvider;
