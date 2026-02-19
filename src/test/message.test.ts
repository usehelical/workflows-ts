import { setupIntegrationTest } from './test-utils';
import { createWorker } from '../main/worker';
import { defineMessage } from '../api/message';
import { receiveMessage } from '../api/steps/receive-message';
import { defineWorkflow } from '../api/workflow';

setupIntegrationTest();

type MockMessage = {
  name: string;
  age: number;
};

describe('Message', () => {
  it('should send and receive a message', async () => {
    const mockMessage = defineMessage<MockMessage>('mock-message');

    const exampleWorkflow = defineWorkflow('exampleWorkflow', async () => {
      return await receiveMessage(mockMessage);
    });

    const api = createWorker({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: 'm',
      },
    });

    const run = await api.runWorkflow(exampleWorkflow);

    const status = await run.getStatus();
    expect(status).toBe('pending');

    api.sendMessage(run.id, mockMessage, { name: 'John', age: 20 });

    const status2 = await run.getStatus();
    expect(status2).toBe('pending');

    const result = await run.waitForResult();
    if ('error' in result) {
      throw result.error;
    }
    expect(result.data).toEqual({ name: 'John', age: 20 });
  });
});
