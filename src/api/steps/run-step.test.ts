import { describe, expect, it, vi } from 'vitest';
import { executeStepWithRetries } from './run-step';
import { FatalError, MaxRetriesExceededError } from '@internal/errors';

describe('executeStepWithRetries', () => {
  it('should execute successfully on first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await executeStepWithRetries('testStep', () => fn(1, 2), {
      maxRetries: 3,
      retryDelay: 100,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  it('should retry on error and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Attempt 1 failed'))
      .mockRejectedValueOnce(new Error('Attempt 2 failed'))
      .mockResolvedValue('success on third try');

    const result = await executeStepWithRetries('testStep', fn, {
      maxRetries: 3,
      retryDelay: 10,
    });

    expect(result).toBe('success on third try');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw MaxRetriesExceededError if max retries is reached', async () => {
    const error1 = new Error('Attempt 1 failed');
    const error2 = new Error('Attempt 2 failed');
    const error3 = new Error('Attempt 3 failed');

    const fn = vi
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockRejectedValueOnce(error3);

    await expect(
      executeStepWithRetries('testStep', fn, {
        maxRetries: 2,
        retryDelay: 10,
      }),
    ).rejects.toThrow(MaxRetriesExceededError);

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw immediately if error is a FatalError', async () => {
    const fatalError = new FatalError('Fatal error occurred');
    const fn = vi.fn().mockRejectedValue(fatalError);

    await expect(
      executeStepWithRetries('testStep', fn, {
        maxRetries: 5,
        retryDelay: 100,
      }),
    ).rejects.toThrow(FatalError);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately when maxRetries is 0', async () => {
    const error = new Error('Failed');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      executeStepWithRetries('testStep', fn, {
        maxRetries: 0,
        retryDelay: 100,
      }),
    ).rejects.toThrow('Failed');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should apply exponential backoff with backOffRate', async () => {
    const startTime = Date.now();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Attempt 1'))
      .mockRejectedValueOnce(new Error('Attempt 2'))
      .mockResolvedValue('success');

    await executeStepWithRetries('testStep', fn, {
      maxRetries: 3,
      retryDelay: 50,
      backOffRate: 2,
    });

    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should handle non-Error thrown values', async () => {
    const fn = vi.fn().mockRejectedValue('string error');

    await expect(
      executeStepWithRetries('testStep', fn, {
        maxRetries: 0,
      }),
    ).rejects.toThrow('string error');
  });

  it('should use default retry config values', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await executeStepWithRetries('testStep', fn, {});

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
