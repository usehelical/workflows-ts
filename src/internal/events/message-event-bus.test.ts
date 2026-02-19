import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageEventBus } from './message-event-bus';
import { Database } from '../db/db';

describe('MessageEventBus', () => {
  let mockDb: Database;
  let mockExecute: ReturnType<typeof vi.fn>;
  let eventBus: MessageEventBus;

  beforeEach(() => {
    mockExecute = vi.fn().mockResolvedValue([]);

    const mockQueryBuilder = {
      selectFrom: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      execute: mockExecute,
    };

    mockDb = mockQueryBuilder as unknown as Database;

    // Use short polling interval for tests
    eventBus = new MessageEventBus(mockDb, 50);
  });

  afterEach(() => {
    eventBus.destroy();
  });

  describe('handleNotify payload parsing', () => {
    it('should parse payload format: destinationWorkflowId::messageType::messageCount', () => {
      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      eventBus.handleNotify('workflow-123::user-action::5');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(undefined);
    });

    it('should not invoke callback when no subscribers for destination/type', () => {
      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      // Different destination
      eventBus.handleNotify('workflow-456::user-action::1');
      expect(callback).not.toHaveBeenCalled();

      // Different type
      eventBus.handleNotify('workflow-123::other-type::1');
      expect(callback).not.toHaveBeenCalled();
    });

    it('should skip event when no subscribers exist', () => {
      // No error should be thrown
      expect(() => {
        eventBus.handleNotify('workflow-123::user-action::1');
      }).not.toThrow();
    });

    it('should parse message count as number', () => {
      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      eventBus.handleNotify('workflow-123::user-action::42');

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Polling behavior', () => {
    it('should query database when subscriptions exist', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          destination_run_id: 'workflow-123',
          type: 'user-action',
          payload: '{"data":"test"}',
        },
      ];

      mockExecute.mockResolvedValue(mockMessages);

      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      // Wait for polling to occur
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDb.selectFrom).toHaveBeenCalledWith('messages');
      expect(callback).toHaveBeenCalled();
    });

    it('should not query database when no subscriptions exist', async () => {
      // No subscriptions

      // Wait for potential polling
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockDb.selectFrom).not.toHaveBeenCalled();
    });

    it('should emit events for all messages from database', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          destination_run_id: 'workflow-123',
          type: 'user-action',
          payload: '{"data":"test1"}',
        },
        {
          id: 'msg-2',
          destination_run_id: 'workflow-456',
          type: 'system-event',
          payload: '{"data":"test2"}',
        },
      ];

      mockExecute.mockResolvedValue(mockMessages);

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.subscribe('workflow-123', 'user-action', callback1);
      eventBus.subscribe('workflow-456', 'system-event', callback2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should build message retrieval requests from subscription keys', async () => {
      eventBus.subscribe('workflow-1', 'type-a', vi.fn());
      eventBus.subscribe('workflow-2', 'type-b', vi.fn());

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should query for both subscriptions
      expect(mockDb.selectFrom).toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    it('should stop polling when destroyed', async () => {
      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      mockExecute.mockResolvedValue([
        {
          id: 'msg-1',
          destination_run_id: 'workflow-123',
          type: 'user-action',
          payload: '{}',
        },
      ]);

      // Wait for first poll
      await new Promise((resolve) => setTimeout(resolve, 100));
      const callCountBeforeDestroy = (mockDb.selectFrom as ReturnType<typeof vi.fn>).mock.calls
        .length;

      eventBus.destroy();

      // Wait for what would be next poll cycle
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not have polled again
      const callCountAfterDestroy = (mockDb.selectFrom as ReturnType<typeof vi.fn>).mock.calls
        .length;
      expect(callCountAfterDestroy).toBe(callCountBeforeDestroy);
    });

    it('should still handle NOTIFY after destroy', () => {
      const callback = vi.fn();
      eventBus.subscribe('workflow-123', 'user-action', callback);

      eventBus.destroy();

      // handleNotify should still work (only polling is stopped)
      expect(() => {
        eventBus.handleNotify('workflow-123::user-action::1');
      }).not.toThrow();

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });
});
