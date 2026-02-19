export type MessageDefinition<T> = {
  name: string;
  __data?: T;
};

export function defineMessage<T>(name: string): MessageDefinition<T> {
  return { name } as MessageDefinition<T>;
}
