import { Client } from 'pg';
import { withDbRetry } from '../db/retry';

type SubscriptionCallback<T> = (data: T) => void;

const CHANNELS = ['state', 'messages', 'status'];

type Channel = (typeof CHANNELS)[number];

export class NotifyEventBus {
  constructor(private readonly client: Client) {}

  async susbcribeToChannels(subscriptions: Record<Channel, SubscriptionCallback<any>>) {
    await withDbRetry(async () => {
      await this.client.connect();

      try {
        await this.client.query(`BEGIN`);
        for (const channel of CHANNELS) {
          await this.client.query(`LISTEN "helical::${channel}"`);
        }
        await this.client.query(`COMMIT`);
      } catch (error) {
        await this.client.query(`ROLLBACK`);
        throw error;
      }

      this.client.on('notification', (msg) => {
        const channel = msg.channel.split('::')[1] as Channel;
        const callback = subscriptions[channel];
        callback(msg.payload);
      });
    });
    return async () => {
      this.client.removeAllListeners();
      await this.client.end();
    };
  }
}
