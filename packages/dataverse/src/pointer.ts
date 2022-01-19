import type {$IntentionalAny} from './types'

type PathToProp = Array<string | number>

type PointerMeta = {
  root: {}
  path: (string | number)[]
}

export type UnindexableTypesForPointer =
  | number
  | string
  | boolean
  | null
  | void
  | undefined
  | Function // eslint-disable-line @typescript-eslint/ban-types

export type UnindexablePointer = {
  [K in $IntentionalAny]: Pointer<undefined>
}

const pointerMetaWeakMap = new WeakMap<{}, PointerMeta>()

/**
 * A wrapper type for the type a `Pointer` points to.
 */
export type PointerType<O> = {
  $$__pointer_type: O
}

/**
 * The type of {@link Atom} pointers. See {@link pointer|pointer()} for an
 * explanation of pointers.
 *
 * @see Atom
 */
export type Pointer<O> = PointerType<O> &
  (O extends UnindexableTypesForPointer
    ? UnindexablePointer
    : unknown extends O
    ? UnindexablePointer
    : O extends (infer T)[]
    ? Pointer<T>[]
    : O extends {}
    ? {
        [K in keyof O]-?: Pointer<O[K]>
      } /*&
        {[K in string | number]: Pointer<K extends keyof O ? O[K] : undefined>}*/
    : UnindexablePointer)

const pointerMetaSymbol = Symbol('pointerMeta')

const cachedSubPointersWeakMap = new WeakMap<
  {},
  Record<string | number, Pointer<unknown>>
>()

const handler = {
  get(obj: {}, prop: string | typeof pointerMetaSymbol): $IntentionalAny {
    if (prop === pointerMetaSymbol) return pointerMetaWeakMap.get(obj)!

    let subs = cachedSubPointersWeakMap.get(obj)
    if (!subs) {
      subs = {}
      cachedSubPointersWeakMap.set(obj, subs)
    }

    if (subs[prop]) return subs[prop]

    const meta = pointerMetaWeakMap.get(obj)!

    const subPointer = pointer({root: meta.root, path: [...meta.path, prop]})
    subs[prop] = subPointer
    return subPointer
  },
}

/**
 * Returns the metadata associated with the pointer. Usually the root object and
 * the path.
 *
 * @param p The pointer.
 */
export const getPointerMeta = (
  p: Pointer<$IntentionalAny> | Pointer<{}> | Pointer<unknown>,
): PointerMeta => {
  // @ts-ignore @todo
  const meta: PointerMeta = p[
    pointerMetaSymbol as unknown as $IntentionalAny
  ] as $IntentionalAny
  return meta
}

/**
 * Returns the root object and the path of the pointer.
 *
 * @example
 * ```ts
 * const {root, path} = getPointerParts(pointer)
 * ```
 *
 * @param p The pointer.
 *
 * @returns An object with two properties: `root`-the root object or the pointer, and `path`-the path of the pointer. `path` is an array of the property-chain.
 */
export const getPointerParts = (
  p: Pointer<$IntentionalAny> | Pointer<{}> | Pointer<unknown>,
): {root: {}; path: PathToProp} => {
  const {root, path} = getPointerMeta(p)
  return {root, path}
}

/**
 * Creates a pointer to a (nested) property of an {@link Atom}.
 *
 * @remarks
 * Pointers are used to make derivations of properties or nested properties of
 * {@link Atom|Atoms}.
 *
 * Pointers also allow easy construction of new pointers pointing to nested members
 * of the root object, by simply using property chaining. E.g. `somePointer.a.b` will
 * create a new pointer that has `'a'` and `'b'` added to the path of `somePointer`.
 *
 * @example
 * ```ts
 * // Here, sum is a derivation that updates whenever the a or b prop of someAtom does.
 * const sum = prism(() => {
 *   return val(pointer({root: someAtom, path: ['a']})) + val(pointer({root: someAtom, path: ['b']}));
 * });
 *
 * // Note, atoms have a convenience Atom.pointer property that points to the root,
 * // which you would normally use in this situation.
 * const sum = prism(() => {
 *   return val(someAtom.pointer.a) + val(someAtom.pointer.b);
 * });
 * ```
 *
 * @param args The pointer parameters.
 * @param args.root The {@link Atom} the pointer applies to.
 * @param args.path The path to the (nested) property the pointer points to.
 *
 * @typeParam O The type of the value being pointed to.
 */
function pointer<O>(args: {root: {}; path?: Array<string | number>}) {
  const meta: PointerMeta = {
    root: args.root as $IntentionalAny,
    path: args.path ?? [],
  }
  const hiddenObj = {}
  pointerMetaWeakMap.set(hiddenObj, meta)
  return new Proxy(hiddenObj, handler) as Pointer<O>
}

export default pointer

/**
 * Returns whether `p` is a pointer.
 */
export const isPointer = (p: $IntentionalAny): p is Pointer<unknown> => {
  return p && !!getPointerMeta(p)
}
