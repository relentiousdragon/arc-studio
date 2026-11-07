import { EventEmitter } from 'node:events';
//
export class InteractionCollector extends EventEmitter {
  constructor(client, filter = () => true, options = {}) {
    super();
    this.client = client;
    this.filter = typeof filter === 'function' ? filter : () => true;
    this.timeout = Number(options.timeout) || 60000;
    this.max = Number(options.max) || Infinity;
    this.collected = [];
    this.ended = false;
    this.timer = null;

    this.onInteraction = (interaction) => {
      if (this.ended) return;
      try {
        const res = this.filter(interaction);
        if (res && typeof res.then === 'function') {
          res.then((matches) => {
            if (this.ended) return;
            if (matches) this._collect(interaction);
            else this.emit('filterFailed', interaction);
          }).catch((err) => this.emit('error', err));
        } else {
          if (res) this._collect(interaction);
          else this.emit('filterFailed', interaction);
        }
      } catch (err) {
        this.emit('error', err);
      }
    };

    this.client.on('interactionCreate', this.onInteraction);

    if (this.timeout > 0 && this.timeout !== Infinity) {
      this.timer = setTimeout(() => {
        this.stop('time');
      }, this.timeout);
    }
  }

  _collect(interaction) {
    this.collected.push(interaction);
    this.emit('collect', interaction);
    if (this.collected.length >= this.max) {
      this.stop('limit');
    }
  }

  stop(reason = 'manual') {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.client.off('interactionCreate', this.onInteraction);
    this.emit('end', this.collected, reason);
  }
}

export class MessageCollector extends EventEmitter {
  constructor(client, filter = () => true, options = {}) {
    super();
    this.client = client;
    this.filter = typeof filter === 'function' ? filter : () => true;
    this.timeout = Number(options.timeout) || 60000;
    this.max = Number(options.max) || Infinity;
    this.collected = [];
    this.ended = false;
    this.timer = null;

    this.onMessage = (message) => {
      if (this.ended) return;
      try {
        const res = this.filter(message);
        if (res && typeof res.then === 'function') {
          res.then((matches) => {
            if (this.ended) return;
            if (matches) this._collect(message);
            else this.emit('filterFailed', message);
          }).catch((err) => this.emit('error', err));
        } else {
          if (res) this._collect(message);
          else this.emit('filterFailed', message);
        }
      } catch (err) {
        this.emit('error', err);
      }
    };

    this.client.on('messageCreate', this.onMessage);

    if (this.timeout > 0 && this.timeout !== Infinity) {
      this.timer = setTimeout(() => {
        this.stop('time');
      }, this.timeout);
    }
  }

  _collect(message) {
    this.collected.push(message);
    this.emit('collect', message);
    if (this.collected.length >= this.max) {
      this.stop('limit');
    }
  }

  stop(reason = 'manual') {
    if (this.ended) return;
    this.ended = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.client.off('messageCreate', this.onMessage);
    this.emit('end', this.collected, reason);
  }
}
