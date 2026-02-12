import { setupIntegrationTest } from './test-utils';
import { createExecutor } from '../main/executor';
import { defineWorkflow } from '../api/workflow';
import { createPromise, createSimpleWorkflow } from './test-helpers';
import { sleep } from '@internal/utils/sleep';

setupIntegrationTest();

describe('Run Handle', () => {
  it('should get the status of a run', async () => {
    const { promise, resolve } = createPromise();
    const exampleWorkflow = defineWorkflow(
      'exampleWorkflow',
      createSimpleWorkflow([() => Promise.resolve(promise)], [], () => {
        return { greeting: 'Hello, World!' };
      }),
    );

    const instance = createExecutor({
      workflows: [exampleWorkflow],
      options: { connectionString: 'dummy', instanceId: 'test-instance' },
    });

    const run = await instance.runWorkflow(exampleWorkflow);
    let status = await run.getStatus();
    expect(status).toBe('pending');

    const instance2 = createExecutor({
      workflows: [exampleWorkflow],
      options: { connectionString: 'dummy', instanceId: 'test-instance-2' },
    });

    const run2 = await instance2.getRun(run.id);
    let status2 = await run2.getStatus();
    expect(status2).toBe('pending');

    resolve(undefined);

    await sleep(100);

    status = await run.getStatus();
    expect(status).toBe('success');

    await sleep(100);

    status2 = await run2.getStatus();
    expect(status2).toBe('success');
  });

  it.todo('should get the result of a void run');

  it.todo('should get the result of a non-void run');

  it.todo('should get the result of a error run');
});
