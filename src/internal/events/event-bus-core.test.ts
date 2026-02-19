import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventBusCore } from './event-bus-core';
import { PollingLoop } from './polling-loop';

type TestEvent = {
  id: string;
  data: string;
};

describe('EventBusCore', () => {
  let mockPollingLoop: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    isRunning: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockPollingLoop = {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn().mockReturnValue(false),
    };
  });

  describe('Basic subscription and emission', () => {
    it('should invoke callback when event is emitted for subscribed subject/key', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', 'test-key', callback);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('test-subject', 'test-key', event, 1);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should not invoke callback for different subject/key', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', 'test-key', callback);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('different-subject', 'test-key', event, 1);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Unsubscribe functionality', () => {
    it('should not invoke callback after unsubscribe', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe('test-subject', 'test-key', callback);

      // Emit first event - should be received
      const event1: TestEvent = { id: '1', data: 'first' };
      eventBus.emitEvent('test-subject', 'test-key', event1, 1);
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      // Emit second event - should NOT be received
      const event2: TestEvent = { id: '2', data: 'second' };
      eventBus.emitEvent('test-subject', 'test-key', event2, 2);
      expect(callback).toHaveBeenCalledTimes(1); // Still only called once
    });
  });

  describe('Multiple subscribers', () => {
    it('should invoke all callbacks subscribed to the same subject/key', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      eventBus.subscribe('test-subject', 'test-key', callback1);
      eventBus.subscribe('test-subject', 'test-key', callback2);
      eventBus.subscribe('test-subject', 'test-key', callback3);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('test-subject', 'test-key', event, 1);

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
      expect(callback3).toHaveBeenCalledWith(event);
    });

    it('should only remove the specific callback on unsubscribe', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe('test-subject', 'test-key', callback1);
      const unsubscribe2 = eventBus.subscribe('test-subject', 'test-key', callback2);

      unsubscribe2();

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('test-subject', 'test-key', event, 1);

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe('Wildcard subscriptions (enabled)', () => {
    it('should invoke wildcard subscriber for any key in the subject', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: true },
        mockPollingLoop as unknown as PollingLoop,
      );

      const wildcardCallback = vi.fn();
      eventBus.subscribe('test-subject', '*', wildcardCallback);

      const event1: TestEvent = { id: '1', data: 'key1 data' };
      eventBus.emitEvent('test-subject', 'key1', event1, 1);

      const event2: TestEvent = { id: '2', data: 'key2 data' };
      eventBus.emitEvent('test-subject', 'key2', event2, 2);

      expect(wildcardCallback).toHaveBeenCalledTimes(2);
      expect(wildcardCallback).toHaveBeenCalledWith(event1);
      expect(wildcardCallback).toHaveBeenCalledWith(event2);
    });

    it('should invoke both wildcard and specific key subscribers', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: true },
        mockPollingLoop as unknown as PollingLoop,
      );

      const wildcardCallback = vi.fn();
      const specificCallback = vi.fn();

      eventBus.subscribe('test-subject', '*', wildcardCallback);
      eventBus.subscribe('test-subject', 'specific-key', specificCallback);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('test-subject', 'specific-key', event, 1);

      expect(wildcardCallback).toHaveBeenCalledWith(event);
      expect(specificCallback).toHaveBeenCalledWith(event);
    });

    it('should not invoke wildcard subscriber for different subject', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: true },
        mockPollingLoop as unknown as PollingLoop,
      );

      const wildcardCallback = vi.fn();
      eventBus.subscribe('subject-a', '*', wildcardCallback);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('subject-b', 'key1', event, 1);

      expect(wildcardCallback).not.toHaveBeenCalled();
    });
  });

  describe('Wildcard subscriptions (disabled)', () => {
    it('should not invoke wildcard subscriber when disabled', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const wildcardCallback = vi.fn();
      const specificCallback = vi.fn();

      eventBus.subscribe('test-subject', '*', wildcardCallback);
      eventBus.subscribe('test-subject', 'specific-key', specificCallback);

      const event: TestEvent = { id: '1', data: 'test data' };
      eventBus.emitEvent('test-subject', 'specific-key', event, 1);

      expect(wildcardCallback).not.toHaveBeenCalled();
      expect(specificCallback).toHaveBeenCalledWith(event);
    });
  });

  describe('Event sequence tracking', () => {
    it('should track event sequence numbers', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', 'test-key', callback);

      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(0);

      const event1: TestEvent = { id: '1', data: 'first' };
      eventBus.emitEvent('test-subject', 'test-key', event1, 5);

      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(5);

      const event2: TestEvent = { id: '2', data: 'second' };
      eventBus.emitEvent('test-subject', 'test-key', event2, 10);

      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(10);
    });

    it('should return 0 for non-existent subject/key', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      expect(eventBus.getEventSequence('non-existent', 'key')).toBe(0);
    });
  });

  describe('Polling loop lifecycle', () => {
    it('should start polling loop on first subscription', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      expect(mockPollingLoop.start).not.toHaveBeenCalled();

      const callback = vi.fn();
      eventBus.subscribe('test-subject', 'test-key', callback);

      expect(mockPollingLoop.start).toHaveBeenCalledTimes(1);
    });

    it('should not start polling loop multiple times for multiple subscriptions', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      eventBus.subscribe('test-subject', 'key1', callback1);
      eventBus.subscribe('test-subject', 'key2', callback2);
      eventBus.subscribe('another-subject', 'key3', callback3);

      expect(mockPollingLoop.start).toHaveBeenCalledTimes(3);
    });

    it('should stop polling loop when all subscriptions are removed', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = eventBus.subscribe('test-subject', 'key1', callback1);
      const unsubscribe2 = eventBus.subscribe('test-subject', 'key2', callback2);

      expect(mockPollingLoop.stop).not.toHaveBeenCalled();

      unsubscribe1();
      expect(mockPollingLoop.stop).not.toHaveBeenCalled(); // Still has one subscriber

      unsubscribe2();
      expect(mockPollingLoop.stop).toHaveBeenCalledTimes(1); // All unsubscribed
    });
  });

  describe('checkHasSubscribers', () => {
    it('should return false when no subscribers exist', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      expect(eventBus.checkHasSubscribers('test-subject', 'test-key')).toBe(false);
    });

    it('should return true when specific key subscriber exists', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', 'test-key', callback);

      expect(eventBus.checkHasSubscribers('test-subject', 'test-key')).toBe(true);
    });

    it('should return true when wildcard subscriber exists (with wildcard enabled)', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: true },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', '*', callback);

      expect(eventBus.checkHasSubscribers('test-subject', 'any-key')).toBe(true);
    });

    it('should return false for wildcard when wildcard disabled', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      eventBus.subscribe('test-subject', '*', callback);

      expect(eventBus.checkHasSubscribers('test-subject', 'specific-key')).toBe(false);
    });

    it('should return false after unsubscribe', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe('test-subject', 'test-key', callback);

      expect(eventBus.checkHasSubscribers('test-subject', 'test-key')).toBe(true);

      unsubscribe();

      expect(eventBus.checkHasSubscribers('test-subject', 'test-key')).toBe(false);
    });
  });

  describe('getSubscriptionKeys', () => {
    it('should return empty array when no subscriptions exist', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      expect(eventBus.getSubscriptionKeys()).toEqual([]);
    });

    it('should return all subscription keys as [subject, key] pairs', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      eventBus.subscribe('subject-a', 'key-1', callback1);
      eventBus.subscribe('subject-a', 'key-2', callback2);
      eventBus.subscribe('subject-b', 'key-3', callback3);

      const keys = eventBus.getSubscriptionKeys();

      expect(keys).toHaveLength(3);
      expect(keys).toContainEqual(['subject-a', 'key-1']);
      expect(keys).toContainEqual(['subject-a', 'key-2']);
      expect(keys).toContainEqual(['subject-b', 'key-3']);
    });

    it('should include wildcard subscriptions', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: true },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe('subject-a', '*', callback1);
      eventBus.subscribe('subject-b', 'specific-key', callback2);

      const keys = eventBus.getSubscriptionKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(['subject-a', '*']);
      expect(keys).toContainEqual(['subject-b', 'specific-key']);
    });

    it('should update when subscriptions are removed', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe('subject-a', 'key-1', callback1);
      const unsubscribe2 = eventBus.subscribe('subject-b', 'key-2', callback2);

      expect(eventBus.getSubscriptionKeys()).toHaveLength(2);

      unsubscribe2();

      const keys = eventBus.getSubscriptionKeys();
      expect(keys).toHaveLength(1);
      expect(keys).toContainEqual(['subject-a', 'key-1']);
    });
  });

  describe('Cleanup on unsubscribe', () => {
    it('should clean up event sequence when all subscribers are removed', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback = vi.fn();
      const unsubscribe = eventBus.subscribe('test-subject', 'test-key', callback);

      const event: TestEvent = { id: '1', data: 'test' };
      eventBus.emitEvent('test-subject', 'test-key', event, 5);

      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(5);

      unsubscribe();

      // After unsubscribe, event sequence should be cleaned up (returns 0)
      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(0);
    });

    it('should maintain event sequence when other subscribers remain', () => {
      const eventBus = new EventBusCore<TestEvent>(
        { allowWildcardSubscriptions: false },
        mockPollingLoop as unknown as PollingLoop,
      );

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe('test-subject', 'test-key', callback1);
      const unsubscribe2 = eventBus.subscribe('test-subject', 'test-key', callback2);

      const event: TestEvent = { id: '1', data: 'test' };
      eventBus.emitEvent('test-subject', 'test-key', event, 5);

      unsubscribe2();

      // Event sequence should still be maintained because callback1 is still subscribed
      expect(eventBus.getEventSequence('test-subject', 'test-key')).toBe(5);
    });
  });
});
