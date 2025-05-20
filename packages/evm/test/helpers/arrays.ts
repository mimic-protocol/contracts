export type NAry<N> = N | N[]

export function toArray<T>(...values: NAry<T>[]): T[] {
  if (values.length === 0) return []
  const [first, ...rest] = values
  const firstArray = Array.isArray(first) ? first : [first]
  return firstArray.concat(toArray(...rest))
}
