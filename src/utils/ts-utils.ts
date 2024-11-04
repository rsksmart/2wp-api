export function isAvailable<Obj extends object>(
  obj: Obj,
  key: PropertyKey,
): key is keyof Obj {
  return key in obj;
}