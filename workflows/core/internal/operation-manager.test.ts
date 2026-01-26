import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    OperationManager,
    returnOrThrowOperationResult,
    executeAndRecordOperation,
    OperationResult,
} from './operation-manager';
import { RunCancelledError } from './errors';
import * as insertOperationModule from './repository/insert-operation';
import * as serializationModule from './serialization';
import { getWorkflowStore } from './store';
import { getRun } from './repository/get-run';

// Mock insertOperation
vi.mock('./repository/insert-operation', () => ({
    insertOperation: vi.fn(),
}));

// Mock withDbRetry to just call the function directly
vi.mock('./db/retry', () => ({
    withDbRetry: vi.fn((fn) => fn()),
}));

// Mock getWorkflowStore for checkCancellation tests
vi.mock('./store', async () => {
    const actual = await vi.importActual('./store');
    return {
        ...actual,
        getWorkflowStore: vi.fn(),
    };
});

// Mock getRun
vi.mock('./repository/get-run', () => ({
    getRun: vi.fn(),
}));

describe('OperationManager', () => {
    const mockDb = {} as any;
    const runId = 'test-run-id';
    let insertOperationMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        insertOperationMock = vi.mocked(insertOperationModule.insertOperation);
    });

    describe('getOperationResult', () => {
        it('should return and remove the last operation from the stack', () => {
            const operations: OperationResult[] = [
                { result: 'result1' },
                { result: 'result2' },
                { result: 'result3' },
            ];
            const manager = new OperationManager(mockDb, runId, operations);

            const op1 = manager.getOperationResult();
            expect(op1).toEqual({ result: 'result3' });

            const op2 = manager.getOperationResult();
            expect(op2).toEqual({ result: 'result2' });

            const op3 = manager.getOperationResult();
            expect(op3).toEqual({ result: 'result1' });
        });

        it('should return null when no operations are available', () => {
            const manager = new OperationManager(mockDb, runId, []);

            const result = manager.getOperationResult();
            expect(result).toBeNull();
        });

        it('should increment sequenceId when operations are popped', () => {
            const operations: OperationResult[] = [{ result: 'result1' }, { result: 'result2' }];
            const manager = new OperationManager(mockDb, runId, operations);

            // getOperationResult increments sequenceId internally
            manager.getOperationResult(); // sequenceId becomes 1
            manager.getOperationResult(); // sequenceId becomes 2

            const seqId = manager.reserveSequenceId();
            expect(seqId).toBe(2); // Should be 2, then increment to 3
        });
    });

    describe('reserveSequenceId', () => {
        it('should increment sequenceId on each call', () => {
            const manager = new OperationManager(mockDb, runId, []);

            expect(manager.reserveSequenceId()).toBe(0);
            expect(manager.reserveSequenceId()).toBe(1);
            expect(manager.reserveSequenceId()).toBe(2);
        });
    });

    describe('recordResult', () => {
        it('should call insertOperation with result', async () => {
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordResult('testOperation', 1, 'serializedResult');

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockDb,
                runId,
                'testOperation',
                1,
                'serializedResult',
            );
        });

        it('should handle null result', async () => {
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordResult('testOperation', 1, null);

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockDb,
                runId,
                'testOperation',
                1,
                undefined,
            );
        });

        it('should use transaction if provided', async () => {
            const mockTx = {} as any;
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordResult('testOperation', 1, 'result', mockTx);

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockTx,
                runId,
                'testOperation',
                1,
                'result',
            );
        });
    });

    describe('recordError', () => {
        it('should call insertOperation with error', async () => {
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordError('testOperation', 1, 'serializedError');

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockDb,
                runId,
                'testOperation',
                1,
                undefined,
                'serializedError',
            );
        });

        it('should handle null error', async () => {
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordError('testOperation', 1, null);

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockDb,
                runId,
                'testOperation',
                1,
                undefined,
                undefined,
            );
        });

        it('should use transaction if provided', async () => {
            const mockTx = {} as any;
            const manager = new OperationManager(mockDb, runId, []);

            await manager.recordError('testOperation', 1, 'error', mockTx);

            expect(insertOperationMock).toHaveBeenCalledWith(
                mockTx,
                runId,
                'testOperation',
                1,
                undefined,
                'error',
            );
        });
    });
});

describe('returnOrThrowOperationResult', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should throw deserialized error if operation has error', () => {
        const mockError = new Error('Test error');
        vi.spyOn(serializationModule, 'deserializeError').mockReturnValue(mockError);

        const operation: OperationResult = {
            error: 'serializedError',
        };

        expect(() => returnOrThrowOperationResult(operation)).toThrow('Test error');
        expect(serializationModule.deserializeError).toHaveBeenCalledWith('serializedError');
    });

    it('should return undefined if result is null', () => {
        const operation: OperationResult = {
            result: undefined,
        };

        const result = returnOrThrowOperationResult(operation);
        expect(result).toBeUndefined();
    });

    it('should return undefined if result is undefined', () => {
        const operation: OperationResult = {};

        const result = returnOrThrowOperationResult(operation);
        expect(result).toBeUndefined();
    });

    it('should return deserialized result', () => {
        const mockResult = { data: 'test' };
        vi.spyOn(serializationModule, 'deserialize').mockReturnValue(mockResult);

        const operation: OperationResult = {
            result: 'serializedResult',
        };

        const result = returnOrThrowOperationResult(operation);
        expect(result).toEqual(mockResult);
        expect(serializationModule.deserialize).toHaveBeenCalledWith('serializedResult');
    });
});

describe('executeAndRecordOperation', () => {
    const mockDb = {} as any;
    const runId = 'test-run-id';
    let insertOperationMock: any;

    beforeEach(() => {
        vi.clearAllMocks();
        insertOperationMock = vi.mocked(insertOperationModule.insertOperation);

        // Mock getWorkflowStore to return a non-aborted signal
        vi.mocked(getWorkflowStore).mockReturnValue({
            abortSignal: { aborted: false },
            runId,
            db: mockDb,
        } as any);

        // Mock getRun to return a non-cancelled run
        vi.mocked(getRun).mockResolvedValue({ status: 'PENDING' } as any);
    });

    it('should execute callback and record result', async () => {
        const manager = new OperationManager(mockDb, runId, []);
        const callback = vi.fn().mockResolvedValue('test result');
        vi.spyOn(serializationModule, 'serialize').mockReturnValue('"test result"');

        const result = await executeAndRecordOperation(manager, 'testOp', callback);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(result).toBe('test result');
        expect(insertOperationMock).toHaveBeenCalledWith(
            mockDb,
            runId,
            'testOp',
            0,
            '"test result"',
        );
    });

    it('should record error if callback throws', async () => {
        const manager = new OperationManager(mockDb, runId, []);
        const error = new Error('Test error');
        const callback = vi.fn().mockRejectedValue(error);
        vi.spyOn(serializationModule, 'serializeError').mockReturnValue('serializedError');

        await expect(executeAndRecordOperation(manager, 'testOp', callback)).rejects.toThrow(
            'Test error',
        );

        expect(insertOperationMock).toHaveBeenCalledWith(
            mockDb,
            runId,
            'testOp',
            0,
            undefined,
            'serializedError',
        );
    });

    it('should not record error if RunCancelledError is thrown', async () => {
        const manager = new OperationManager(mockDb, runId, []);
        const error = new RunCancelledError();
        const callback = vi.fn().mockRejectedValue(error);

        await expect(executeAndRecordOperation(manager, 'testOp', callback)).rejects.toThrow(
            RunCancelledError,
        );

        expect(insertOperationMock).not.toHaveBeenCalled();
    });

    it('should handle non-Error thrown values', async () => {
        const manager = new OperationManager(mockDb, runId, []);
        const callback = vi.fn().mockRejectedValue('string error');
        vi.spyOn(serializationModule, 'serializeError').mockReturnValue('serializedError');

        await expect(executeAndRecordOperation(manager, 'testOp', callback)).rejects.toBe(
            'string error',
        );

        expect(insertOperationMock).toHaveBeenCalledWith(
            mockDb,
            runId,
            'testOp',
            0,
            undefined,
            'serializedError',
        );
    });

    it('should increment sequence ID on each operation', async () => {
        const manager = new OperationManager(mockDb, runId, []);
        const callback1 = vi.fn().mockResolvedValue('result1');
        const callback2 = vi.fn().mockResolvedValue('result2');
        vi.spyOn(serializationModule, 'serialize').mockReturnValue('serialized');

        await executeAndRecordOperation(manager, 'op1', callback1);
        await executeAndRecordOperation(manager, 'op2', callback2);

        expect(insertOperationMock).toHaveBeenCalledWith(mockDb, runId, 'op1', 0, 'serialized');
        expect(insertOperationMock).toHaveBeenCalledWith(mockDb, runId, 'op2', 1, 'serialized');
    });
});
