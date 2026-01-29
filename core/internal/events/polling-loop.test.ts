import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PollingLoop } from './polling-loop';

describe('PollingLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should start polling and invoke callback at intervals', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0); // 0 jitter for predictability

      pollingLoop.start();

      // Initially not called
      expect(callback).not.toHaveBeenCalled();

      // First interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Third interval
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(3);

      pollingLoop.stop();
    });

    it('should not invoke callback before first interval', () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback);

      pollingLoop.start();

      expect(callback).not.toHaveBeenCalled();

      pollingLoop.stop();
    });

    it('should stop polling when stop is called', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      pollingLoop.stop();

      // After stop, callback should not be called anymore
      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).toHaveBeenCalledTimes(1); // Still only 1
    });
  });

  describe('Start/Stop behavior', () => {
    it('should not start multiple times if already running', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();
      pollingLoop.start();
      pollingLoop.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1); // Only one callback per interval

      pollingLoop.stop();
    });

    it('should report running status correctly', () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback);

      expect(pollingLoop.isRunning()).toBe(false);

      pollingLoop.start();
      expect(pollingLoop.isRunning()).toBe(true);

      pollingLoop.stop();
      expect(pollingLoop.isRunning()).toBe(false);
    });

    it('should be able to restart after stop', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      pollingLoop.stop();

      // Restart
      pollingLoop.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      pollingLoop.stop();
    });
  });

  describe('Jitter functionality', () => {
    it('should apply jitter to intervals when jitterFactor is set', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0.5); // 50% jitter

      // Mock Math.random to return predictable values
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = vi.fn(() => {
        callCount++;
        return 0.8; // Will produce positive jitter
      });

      pollingLoop.start();

      // First interval - should be around 1000 + (0.8 * 2 - 1) * 500 = 1000 + 300 = 1300ms
      await vi.advanceTimersByTimeAsync(1300);
      expect(callback).toHaveBeenCalledTimes(1);

      pollingLoop.stop();
      Math.random = originalRandom;
    });

    it('should handle zero jitter factor', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();

      // Should be exactly 1000ms intervals
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      pollingLoop.stop();
    });

    it('should clamp jitter factor to valid range', async () => {
      const callback = vi.fn();

      // Test negative jitter (should be clamped to 0)
      const pollingLoopNegative = new PollingLoop(1000, callback, -0.5);
      pollingLoopNegative.start();
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);
      pollingLoopNegative.stop();

      callback.mockClear();

      // Test jitter > 1 (should be clamped to 1)
      const pollingLoopOver = new PollingLoop(1000, callback, 1.5);
      pollingLoopOver.start();
      // With jitter factor of 1, max interval is 2000ms
      await vi.advanceTimersByTimeAsync(2000);
      expect(callback).toHaveBeenCalled();
      pollingLoopOver.stop();
    });
  });

  describe('Callback execution', () => {
    it('should continue polling even if callback throws error', async () => {
      const callback = vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('Test error');
        })
        .mockImplementationOnce(() => {
          throw new Error('Test error 2');
        })
        .mockImplementation(() => 'success');

      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();

      // First call throws, but polling continues
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second call throws, but polling continues
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      // Third call succeeds
      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(3);

      pollingLoop.stop();
    });

    it('should handle async callbacks', async () => {
      const callback = vi.fn().mockResolvedValue('async result');
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(callback).toHaveBeenCalledTimes(2);

      pollingLoop.stop();
    });
  });

  describe('Edge cases', () => {
    it('should handle very short intervals', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(10, callback, 0);

      pollingLoop.start();

      await vi.advanceTimersByTimeAsync(50);
      expect(callback).toHaveBeenCalledTimes(5);

      pollingLoop.stop();
    });

    it('should not schedule next if stopped before interval completes', async () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback, 0);

      pollingLoop.start();
      pollingLoop.stop();

      await vi.advanceTimersByTimeAsync(5000);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle stop called multiple times', () => {
      const callback = vi.fn();
      const pollingLoop = new PollingLoop(1000, callback);

      pollingLoop.start();
      pollingLoop.stop();
      pollingLoop.stop();
      pollingLoop.stop();

      expect(pollingLoop.isRunning()).toBe(false);
    });
  });
});
