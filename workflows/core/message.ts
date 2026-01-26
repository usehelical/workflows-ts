export type MessageDefinition<T> = {
  name: string;
  data?: T;
};

export function defineMessage<T>(name: string): MessageDefinition<T> {
  return { name } as MessageDefinition<T>;
}
