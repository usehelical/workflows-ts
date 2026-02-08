import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineMessage } from '../core/message';
import { receiveMessage } from '../core/steps/receive-message';
import { defineWorkflow } from '../core/workflow';
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
        async () => {
          return await receiveMessage(mockMessage);
        },
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'message.test.ts:35',
        message: 'Workflow started',
        data: { runId: run.id },
        timestamp: Date.now(),
        hypothesisId: 'C',
      }),
    }).catch(() => {});
    // #endregion

    const status = await run.getStatus();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'message.test.ts:37',
        message: 'First status check',
        data: { runId: run.id, status },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'post-fix',
      }),
    }).catch(() => {});
    // #endregion
    expect(status).toBe('pending');

    instance.sendMessage(run, mockMessage, { name: 'John', age: 20 });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'message.test.ts:40',
        message: 'Message sent',
        data: { runId: run.id },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'post-fix',
      }),
    }).catch(() => {});
    // #endregion

    const status2 = await run.getStatus();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f6149db0-0a7e-4b67-912f-39e5bca62810', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'message.test.ts:42',
        message: 'Second status check',
        data: { runId: run.id, status: status2 },
        timestamp: Date.now(),
        hypothesisId: 'C',
        runId: 'post-fix',
      }),
    }).catch(() => {});
    // #endregion
    expect(status2).toBe('pending');

    const result = await run.waitForResult();
    if ('error' in result) {
      throw result.error;
    }
    expect(result.data).toEqual({ name: 'John', age: 20 });
  });
});
