// The lifecycle owns the hard budget; model text cannot extend or restart it.
export class BotDialogue {
  constructor({ respond, send, onEnd = async () => {}, timeoutMs = 90_000 }) {
    this.respond = respond;
    this.send = send;
    this.onEnd = onEnd;
    this.timeoutMs = timeoutMs;
    this.sessions = new Map();
  }

  async start(options) {
    if (this.sessions.has(options.channelId)) throw new Error('Dialogue already active');
    const session = { ...options, sent: 0, received: 0, awaiting: false, history: [], timer: null, lastMessageId: null };
    this.sessions.set(session.channelId, session);
    this.arm(session);
    try { await this.speak(session, session.topic); }
    catch (error) { this.finish(session, 'error'); throw error; }
    return session;
  }

  arm(session) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => this.finish(session, 'timeout'), this.timeoutMs);
    session.timer.unref?.();
  }

  finish(session, reason) {
    if (this.sessions.get(session.channelId) !== session) return;
    clearTimeout(session.timer);
    session.awaiting = false;
    this.sessions.delete(session.channelId);
    Promise.resolve().then(() => this.onEnd(session, reason)).catch(() => {});
  }

  async speak(session, text) {
    if (this.sessions.get(session.channelId) !== session || session.sent >= 3) return;
    session.awaiting = false;
    const reply = await this.respond(session, text);
    if (this.sessions.get(session.channelId) !== session) return;
    session.sending = true;
    let sent;
    try { sent = await this.send(session, reply); }
    finally { session.sending = false; }
    if (this.sessions.get(session.channelId) !== session) return;
    session.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    session.sent++;
    session.lastMessageId = sent.id;
    session.awaiting = true;
    this.arm(session);
    if (session.pending) {
      const pending = session.pending;
      session.pending = null;
      await this.receive(pending);
    }
  }

  async receive(message) {
    const session = this.sessions.get(message.channelId);
    if (!session || message.authorId !== session.targetId || !message.content?.trim()) return false;
    if (session.sending && !session.awaiting) { session.pending ??= message; return true; }
    if (!session.awaiting) return false;
    if (message.replyTo ? message.replyTo !== session.lastMessageId : !message.mentionsBot) return false;
    // Reserve this turn synchronously so duplicate messages cannot spend twice.
    session.awaiting = false;
    session.received++;
    if (session.received >= 3) { this.finish(session, 'complete'); return true; }
    try { await this.speak(session, message.content.slice(0, 2000)); }
    catch (error) { this.finish(session, 'error'); throw error; }
    return true;
  }

  stop(channelId, actorId, admin = false) {
    const session = this.sessions.get(channelId);
    if (!session) return 'missing';
    if (actorId !== session.initiatorId && !admin) return 'forbidden';
    this.finish(session, 'stopped');
    return 'stopped';
  }

  close() { for (const session of [...this.sessions.values()]) this.finish(session, 'shutdown'); }
}
