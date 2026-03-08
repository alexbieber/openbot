// gateway/routes/config.js
import { Router } from 'express';
import { loadConfig } from '../../config/loader.js';

const router = Router();

router.get('/', (req, res) => {
  const config = loadConfig();
  // Mask sensitive keys
  const safe = JSON.parse(JSON.stringify(config));
  if (safe.ai?.anthropicApiKey) safe.ai.anthropicApiKey = '***' + safe.ai.anthropicApiKey.slice(-4);
  if (safe.ai?.openaiApiKey) safe.ai.openaiApiKey = '***' + safe.ai.openaiApiKey.slice(-4);
  res.json(safe);
});

export default router;
