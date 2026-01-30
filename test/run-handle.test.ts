import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineWorkflow, WorkflowStatus } from '../core/workflow';
import { createPromise, createResolvableStep, createSimpleWorkflow } from './test-helpers';
import { sleep } from '../core/internal/utils/sleep';

setupIntegrationTest();

describe('Run Handle', () => {
  it('should get the status of a run', async () => {
    const { promise, resolve } = createPromise();
    const exampleWorkflow = defineWorkflow(
      createSimpleWorkflow([createResolvableStep(promise)], [], () => {
        return { greeting: 'Hello, World!' };
      }),
    );

    const instance = createInstance({
      workflows: { exampleWorkflow },
      options: { connectionString: 'dummy', instanceId: 'test-instance' },
    });

    const run = await instance.runWorkflow(exampleWorkflow);
    let status = await run.status();
    expect(status).toBe(WorkflowStatus.PENDING);

    const instance2 = createInstance({
      workflows: { exampleWorkflow },
      options: { connectionString: 'dummy', instanceId: 'test-instance-2' },
    });

    const run2 = await instance2.getRun(run.id);
    let status2 = await run2.status();
    expect(status2).toBe(WorkflowStatus.PENDING);

    resolve(undefined);

    await sleep(100);

    status = await run.status();
    expect(status).toBe(WorkflowStatus.SUCCESS);

    await sleep(100);

    status2 = await run2.status();
    expect(status2).toBe(WorkflowStatus.SUCCESS);
  });

  it.todo('should get the result of a void run');

  it.todo('should get the result of a non-void run');

  it.todo('should get the result of a error run');
});
