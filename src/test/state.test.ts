import { setupIntegrationTest } from './test-utils';
import { createWorker } from '../main/worker';
import { defineState } from '../api/state';
import { setState } from '../api/steps/set-state';
import { defineWorkflow } from '../api/workflow';
import { createSimpleWorkflow } from './test-helpers';

setupIntegrationTest();

type MockState = {
  name: string;
  progress: number;
};

describe('State', () => {
  it('should get and set state', async () => {
    const state = defineState<MockState>('test-state');

    const data = { name: 'John', progress: 50 };

    const workflow = defineWorkflow(
      createSimpleWorkflow([
        async () => {
          await setState(state, data);
        },
      ]),
    );

    const instance = createWorker({
      workflows: {
        'test-workflow': workflow,
      },
      options: {
        connectionString: 'dummy',
      },
    });

    const run = await instance.runWorkflow('test-workflow');
    await run.waitForResult();
    const stateResult = await instance.getState(run, state);
    expect(stateResult).toEqual(data);
  });
});
