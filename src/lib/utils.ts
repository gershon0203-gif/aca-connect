/**
 * Tiny className combiner. Keeps component props readable without pulling in
 * an extra dependency.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ')
}
