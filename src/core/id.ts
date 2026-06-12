import { ulid } from "ulid";

let _factory: () => string = ulid;

export function newId(): string {
  return _factory();
}

export function setIdFactory(fn: () => string): void {
  _factory = fn;
}
