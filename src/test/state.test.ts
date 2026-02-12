import { setupIntegrationTest } from './test-utils';
import { createExecutor } from '../main/executor';
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
      'test-workflow',
      createSimpleWorkflow([
        async () => {
          await setState(state, data);
        },
      ]),
    );

    const instance = createExecutor({
      workflows: [workflow],
      options: {
        connectionString: 'dummy',
      },
    });

    const run = await instance.runWorkflow(workflow);
    await run.waitForResult();
    const stateResult = await instance.getState(run, state);
    expect(stateResult).toEqual(data);
  });
});
