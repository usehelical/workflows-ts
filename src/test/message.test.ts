import { setupIntegrationTest } from './test-utils';
import { createExecutor } from '../main/executor';
import { defineMessage } from '../api/message';
import { receiveMessage } from '../api/steps/receive-message';
import { defineWorkflow } from '../api/workflow';
import { createSimpleWorkflow } from './test-helpers';

setupIntegrationTest();

type MockMessage = {
  name: string;
  age: number;
};

describe('Message', () => {
  it('should send and receive a message', async () => {
    const mockMessage = defineMessage<MockMessage>('mock-message');

    const exampleWorkflow = defineWorkflow(
      'exampleWorkflow',
      createSimpleWorkflow([
        async () => {
          return await receiveMessage(mockMessage);
        },
      ]),
    );

    const instance = createExecutor({
      workflows: [exampleWorkflow],
      options: {
        connectionString: 'dummy',
        instanceId: 'm',
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.getStatus();
    expect(status).toBe('pending');

    instance.sendMessage(run, mockMessage, { name: 'John', age: 20 });

    const status2 = await run.getStatus();
    expect(status2).toBe('pending');

    const result = await run.waitForResult();
    if ('error' in result) {
      throw result.error;
    }
    expect(result.data).toEqual({ name: 'John', age: 20 });
  });
});
