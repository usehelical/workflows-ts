export type StreamDefinition<T> = {
  name: string;
  __data?: T;
};

export function defineStream<T>(name: string): StreamDefinition<T> {
  return { name } as StreamDefinition<T>;
}
