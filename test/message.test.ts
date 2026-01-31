import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineMessage } from '../core/message';
import { defineStep } from '../core/step';
import { receiveMessage } from '../core/steps/receive-message';
import { defineWorkflow, WorkflowStatus } from '../core/workflow';
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
      createSimpleWorkflow([
        defineStep(async () => {
          return await receiveMessage(mockMessage);
        }),
      ]),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: {
        connectionString: 'dummy',
        instanceId: 'm',
      },
    });

    const run = await instance.runWorkflow(exampleWorkflow);

    const status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    instance.sendMessage(run, mockMessage, { name: 'John', age: 20 });

    const status2 = await run.status();
    expect(status2).toBe(WorkflowStatus.PENDING);
  });
});
