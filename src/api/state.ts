export interface StateDefinition<T> {
  name: string;
  __data?: T;
}

export function defineState<T>(name: string) {
  return {
    name,
  } as StateDefinition<T>;
}
