/* index.ts — process entrypoint: build the app and start listening. */

import { createApp } from './app.js';
import { PORT } from './paths.js';

const { app } = createApp();

app.listen(PORT, () => {
  console.log(`\n  ✓  Analytics App  →  http://localhost:${PORT}\n`);
});
