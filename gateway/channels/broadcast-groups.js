/**
 * OpenBot Broadcast Groups
 * Send one message to multiple channel targets simultaneously.
 * Mirrors ClawdBot's broadcast-groups.md feature.
 */

export class BroadcastGroupManager {
  constructor(config = {}) {
    this._groups = new Map();
    // Load from config
    const groups = config?.channels?.broadcastGroups || {};
    for (const [id, group] of Object.entries(groups)) {
      this._groups.set(id, { id, ...group });
    }
  }

  addGroup(id, targets, opts = {}) {
    const group = { id, targets, label: opts.label || id, createdAt: new Date().toISOString() };
    this._groups.set(id, group);
    return group;
  }

  removeGroup(id) {
    return this._groups.delete(id);
  }

  getGroup(id) {
    return this._groups.get(id);
  }

  listGroups() {
    return Array.from(this._groups.values());
  }

  /**
   * Broadcast a message to all targets in a group.
   * @param {string} groupId
   * @param {string} text
   * @param {Map<string, object>} channelAdapters - channel name -> adapter instance
   */
  async broadcast(groupId, text, channelAdapters) {
    const group = this._groups.get(groupId);
    if (!group) throw new Error(`Broadcast group '${groupId}' not found`);

    const results = [];
    for (const target of group.targets) {
      const { channel, id: targetId, accountId } = target;
      const adapter = channelAdapters?.get(channel);
      if (!adapter) {
        results.push({ channel, targetId, status: 'no-adapter' });
        continue;
      }
      try {
        await adapter.send(targetId, text, { accountId });
        results.push({ channel, targetId, status: 'sent' });
      } catch (err) {
        results.push({ channel, targetId, status: 'error', error: err.message });
      }
    }
    return { groupId, results };
  }
}
