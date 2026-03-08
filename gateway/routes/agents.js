// gateway/routes/agents.js
// Returns agents from the main config object (populated at startup from AGENTS.md + openbot.json).
// globalThis._openBotConfig is set in server.js before this router is mounted.
import { Router } from 'express';

const router = Router();

function getAgentList() {
  const config = globalThis._openBotConfig || {};
  const list = config.agents?.list || [];
  if (list.length) return list;
  return [{ id: 'default', name: 'default', description: 'Default agent', skills: [], model: 'claude-sonnet-4-6' }];
}

router.get('/', (req, res) => {
  res.json(getAgentList());
});

router.get('/:id', (req, res) => {
  const agent = getAgentList().find(a => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

export default router;
