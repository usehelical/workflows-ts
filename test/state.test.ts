import { setupIntegrationTest } from './test-utils';
import { createInstance } from '../client/runtime';
import { defineState } from '../core/state';
import { setState } from '../core/steps/set-state';
import { defineWorkflow } from '../core/workflow';
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

    const instance = createInstance({
      workflows: { workflow },
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
