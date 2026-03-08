/**
 * OpenBot Agent Router — Multi-Agent Routing with Bindings
 * Mirrors ClawdBot's deterministic "most-specific-wins" routing.
 *
 * Binding priority (highest to lowest):
 *  1. peer match (exact DM/group id)
 *  2. parentPeer match
 *  3. guildId + roles (Discord)
 *  4. guildId (Discord)
 *  5. teamId (Slack)
 *  6. accountId match for a channel
 *  7. channel-wide match (accountId: "*")
 *  8. fallback to default agent
 */

export class AgentRouter {
  constructor(agentList = [], bindings = [], defaultAgentId = 'default') {
    this.agentList = agentList;
    this.bindings = bindings;
    this.defaultAgentId = defaultAgentId;
    this._buildIndex();
  }

  _buildIndex() {
    // Find default agent
    const defaultAgent = this.agentList.find(a => a.default) || this.agentList[0];
    this._defaultId = defaultAgent?.id || this.defaultAgentId;
  }

  /**
   * Resolve which agentId handles this inbound message.
   * @param {object} msg - { channel, accountId, peer: { kind, id }, guildId, teamId, roles }
   */
  resolve(msg = {}) {
    const { channel, accountId, peer, guildId, teamId, roles = [] } = msg;

    // Score each binding; higher = more specific
    let best = null;
    let bestScore = -1;

    for (const binding of this.bindings) {
      const m = binding.match || {};
      let score = 0;
      let matches = true;

      // Channel must match (required unless absent)
      if (m.channel) {
        if (m.channel !== channel) { matches = false; continue; }
        score += 1;
      }

      // accountId
      if (m.accountId && m.accountId !== '*') {
        if (m.accountId !== (accountId || 'default')) { matches = false; continue; }
        score += 2;
      }

      // teamId (Slack)
      if (m.teamId) {
        if (m.teamId !== teamId) { matches = false; continue; }
        score += 4;
      }

      // guildId (Discord)
      if (m.guildId) {
        if (m.guildId !== guildId) { matches = false; continue; }
        score += 4;
      }

      // roles (Discord) — at least one must match
      if (m.roles && m.roles.length > 0) {
        if (!roles.some(r => m.roles.includes(r))) { matches = false; continue; }
        score += 8;
      }

      // peer — most specific
      if (m.peer) {
        const { kind, id } = m.peer;
        if (!peer) { matches = false; continue; }
        if (kind && kind !== peer.kind) { matches = false; continue; }
        if (id && id !== peer.id) { matches = false; continue; }
        score += 16;
      }

      // parentPeer
      if (m.parentPeer) {
        const { kind, id } = m.parentPeer;
        if (!msg.parentPeer) { matches = false; continue; }
        if (kind && kind !== msg.parentPeer?.kind) { matches = false; continue; }
        if (id && id !== msg.parentPeer?.id) { matches = false; continue; }
        score += 8;
      }

      if (matches && score > bestScore) {
        best = binding;
        bestScore = score;
      }
    }

    return best?.agentId || this._defaultId;
  }

  /** Update routing config at runtime (after config hot-reload) */
  update(agentList, bindings, defaultAgentId) {
    this.agentList = agentList || this.agentList;
    this.bindings = bindings || this.bindings;
    if (defaultAgentId) this.defaultAgentId = defaultAgentId;
    this._buildIndex();
  }

  listAgents() { return this.agentList; }
  listBindings() { return this.bindings; }

  getAgent(id) {
    return this.agentList.find(a => a.id === id) || null;
  }
}
