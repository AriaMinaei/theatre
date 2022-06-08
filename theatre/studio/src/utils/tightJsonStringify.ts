/**
 * Stringifies an object in a developer-readable, command line friendly way
 * (not too spaced out, but with enough whitespace to be readable).
 *
 * Also, see the examples in [`./tightJsonStringify.test.ts`](./tightJsonStringify.test.ts)
 */
export function tightJsonStringify(
  obj: any,
  replacer?: ((this: any, key: string, value: any) => any) | undefined,
) {
  return JSON.stringify(obj, replacer, 2)
    .replace(/^([\{\[])\n (\s+)/, '$1$2')
    .replace(/(\n[ ]+[\{\[])\n\s+/g, '$1 ')
    .replace(/\n\s*([\]\}])/g, ' $1')
}
