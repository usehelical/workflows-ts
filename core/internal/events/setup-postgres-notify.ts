import { Client } from '../db/driver';
import { withDbRetry } from '../db/retry';

type SubscriptionCallback<T> = (data: T) => void;

const CHANNELS = ['runs', 'messages', 'status'];

type Channel = (typeof CHANNELS)[number];

type Subscriptions = {
  [K in Channel]: SubscriptionCallback<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function setupPostgresNotify(client: Client, subscriptions: Subscriptions) {
  await withDbRetry(async () => {
    try {
      await client.query(`BEGIN`);
      for (const channel of CHANNELS) {
        await client.query(`LISTEN "helical_${channel}"`);
      }
      await client.query(`COMMIT`);
    } catch (error) {
      await client.query(`ROLLBACK`);
      throw error;
    }

    for (const [channel, callback] of Object.entries(subscriptions)) {
      await client.listen(`helical_${channel}`, callback);
    }
  });
}
