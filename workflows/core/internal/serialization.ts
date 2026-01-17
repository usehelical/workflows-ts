interface Serializer {
  serialize<T>(value: T): string;
  deserialize<T>(value: string): T;
}

export class JSONSerializer implements Serializer {
  serialize<T>(value: T): string {
    return JSON.stringify(value);
  }

  deserialize<T>(value: string): T {
    return JSON.parse(value);
  }
}
