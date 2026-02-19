import { SerializationError } from '../errors';
import {
  serializeError as _serializeError,
  deserializeError as _deserializeError,
} from 'serialize-error';

/**
 * Serializes a value into a JSON string.
 */
export function serialize<T>(value: T): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    throw new SerializationError((error as Error).message);
  }
}

/**
 * Deserializes a JSON string into a value.
 */
export function deserialize<T>(value: string): T {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new SerializationError((error as Error).message);
  }
}

/**
 * Serializes an error object, preserving stack trace, message, name, and custom properties
 */
export function serializeError(error: Error): string {
  try {
    return JSON.stringify(_serializeError(error));
  } catch (error) {
    throw new SerializationError((error as Error).message);
  }
}

/**
 * Deserializes an error object, reconstructing it with stack trace and properties
 */
export function deserializeError(serialized: string): Error {
  try {
    return _deserializeError(JSON.parse(serialized));
  } catch (error) {
    throw new SerializationError((error as Error).message);
  }
}
