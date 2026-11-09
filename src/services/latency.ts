/** Shared artificial latency used by the demo data-access layer. */
export const LATENCY = 450

export function delay<T>(value: T, ms = LATENCY): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}
