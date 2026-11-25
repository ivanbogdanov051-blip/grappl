// PeerJS star network: the first peer to claim the room id becomes host and relays all messages.
// If the host leaves, remaining peers race to claim the room id (host migration).
/* global Peer */

export class Net {
  constructor(handlers) {
    this.h = handlers;
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
    this.isHost = false;
    this.id = null;
    this.ready = false;
    this.room = null;
  }
  start(room) { this.room = room; this.tryHost(); }
  status(s) { if (this.h.onStatus) this.h.onStatus(s); }

  cleanup() {
    this.ready = false;
    for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
    this.conns.clear();
    if (this.hostConn) { try { this.hostConn.close(); } catch (e) { /* ignore */ } }
    this.hostConn = null;
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
    this.peer = null;
  }

  tryHost() {
    this.cleanup();
    this.status('Connecting…');
    const peer = new Peer(this.room, { debug: 1 });
    this.peer = peer;
    peer.on('open', (id) => {
      if (peer !== this.peer) return;
      this.isHost = true; this.id = id; this.ready = true;
      this.status('host');
      this.h.onReady(id);
    });
    peer.on('connection', (c) => this.addClient(c));
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'unavailable-id') this.joinAsClient();
      else this.fail(err);
    });
    peer.on('disconnected', () => {
      if (peer === this.peer && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* ignore */ } }, 1000);
    });
  }

  joinAsClient() {
    this.cleanup();
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    peer.on('open', (id) => {
      if (peer !== this.peer) return;
      this.id = id; this.isHost = false;
      const c = peer.connect(this.room, { reliable: true });
      this.hostConn = c;
      const to = setTimeout(() => { if (!c.open && peer === this.peer) this.retryLater(); }, 9000);
      c.on('open', () => {
        clearTimeout(to);
        if (peer !== this.peer) return;
        this.ready = true;
        this.status('client');
        this.h.onReady(id);
      });
      c.on('data', (d) => this.h.onMessage(d));
      c.on('close', () => {
        if (peer !== this.peer) return;
        this.ready = false;
        this.status('Host left – reconnecting…');
        this.h.onHostLost && this.h.onHostLost();
        this.retryLater();
      });
      c.on('error', () => {});
    });
    peer.on('error', (err) => {
      if (peer !== this.peer) return;
      if (err.type === 'peer-unavailable') this.retryLater(true);
      else this.fail(err);
    });
  }

  retryLater(fast) {
    this.ready = false;
    const d = (fast ? 300 : 800) + Math.random() * 1800;
    const myPeer = this.peer;
    setTimeout(() => { if (this.peer === myPeer) this.tryHost(); }, d);
  }

  fail(err) {
    console.warn('[net]', err.type, err);
    this.status('Network problem: ' + err.type);
    if (['network', 'server-error', 'socket-error', 'socket-closed', 'webrtc'].includes(err.type)) this.retryLater();
  }

  addClient(c) {
    c.on('open', () => { this.conns.set(c.peer, c); });
    c.on('data', (d) => {
      this.h.onMessage(d);
      for (const [id, o] of this.conns) if (id !== c.peer && o.open) o.send(d);
    });
    c.on('close', () => {
      this.conns.delete(c.peer);
      this.h.onLeave(c.peer);
      const m = { t: 'leave', id: c.peer };
      for (const o of this.conns.values()) if (o.open) o.send(m);
    });
    c.on('error', () => {});
  }

  send(m) {
    if (!this.ready) return;
    if (this.isHost) { for (const c of this.conns.values()) if (c.open) c.send(m); }
    else if (this.hostConn && this.hostConn.open) this.hostConn.send(m);
  }
}
