import useRefAndState from '@theatre/studio/utils/useRefAndState'
import React, {useCallback, useContext, useEffect, useRef} from 'react'
import {createPortal} from 'react-dom'
import {PortalContext} from 'reakit'
import type {AbsolutePlacementBoxConstraints} from './TooltipWrapper'
import TooltipWrapper from './TooltipWrapper'

export type OpenFn = (
  e: React.MouseEvent | MouseEvent | {clientX: number; clientY: number},
  target: HTMLElement,
) => void
type CloseFn = (reason: string) => void
type State =
  | {isOpen: false}
  | {
      isOpen: true
      clickPoint: {
        clientX: number
        clientY: number
      }
      target: HTMLElement
      opts: Opts
      onPointerOutside?: {
        threshold: number
        callback: (e: MouseEvent) => void
      }
      onClickOutside: () => void
    }

const PopoverAutoCloseLock = React.createContext({
  // defaults have no effects, since there would not be a
  // parent popover to worry about auto-closing.
  takeFocus() {
    return {
      releaseFocus() {},
    }
  },
})

type Opts = {
  debugName: string
  closeWhenPointerIsDistant?: boolean
  pointerDistanceThreshold?: number
  closeOnClickOutside?: boolean
  constraints?: AbsolutePlacementBoxConstraints
}

export default function usePopover(
  _opts: Opts | (() => Opts),
  render: () => React.ReactElement,
): [node: React.ReactNode, open: OpenFn, close: CloseFn, isOpen: boolean] {
  const _debug = (...args: any) => {}

  const [stateRef, state] = useRefAndState<State>({
    isOpen: false,
  })

  const optsRef = useRef(_opts)

  const close = useCallback<CloseFn>((reason: string): void => {
    _debug(`closing due to "${reason}"`)
    stateRef.current = {isOpen: false}
  }, [])

  const open = useCallback<OpenFn>((e, target) => {
    const opts =
      typeof optsRef.current === 'function'
        ? optsRef.current()
        : optsRef.current

    function onClickOutside(): void {
      if (lock.childHasFocusRef.current) return
      if (opts.closeOnClickOutside !== false) {
        close('clicked outside popover')
      }
    }

    stateRef.current = {
      isOpen: true,
      clickPoint: {clientX: e.clientX, clientY: e.clientY},
      target,
      opts,
      onClickOutside: onClickOutside,
      onPointerOutside:
        opts.closeWhenPointerIsDistant === false
          ? undefined
          : {
              threshold: opts.pointerDistanceThreshold ?? 100,
              callback: () => {
                if (lock.childHasFocusRef.current) return
                close('pointer outside')
              },
            },
    }
  }, [])

  /**
   * See doc comment on {@link useAutoCloseLockState}.
   * Used to ensure that moving far away from a parent popover doesn't
   * close a child popover.
   */
  const lock = useAutoCloseLockState({
    _debug,
    state,
  })

  const portalLayer = useContext(PortalContext)

  const node = state.isOpen ? (
    createPortal(
      <PopoverAutoCloseLock.Provider value={lock.childPopoverLock}>
        <TooltipWrapper
          children={render}
          target={state.target}
          onClickOutside={state.onClickOutside}
          onPointerOutside={state.onPointerOutside}
          constraints={state.opts.constraints}
        />
      </PopoverAutoCloseLock.Provider>,
      portalLayer!,
    )
  ) : (
    <></>
  )

  return [node, open, close, state.isOpen]
}

/**
 * Keep track of the current lock state, and provide
 * a lock that can be passed down to popover children.
 *
 * Used to ensure that moving far away from a parent popover doesn't
 * close a child popover.
 * When child popovers are opened, we want to suspend all auto-closing
 * behaviors for parenting popovers.
 */
function useAutoCloseLockState(options: {
  state: State
  _debug: (message: string, args?: object) => void
}) {
  const parentLock = useContext(PopoverAutoCloseLock)

  useEffect(() => {
    if (options.state.isOpen) {
      // when this "popover" is open, then take focus from parent
      const focused = parentLock.takeFocus()
      options._debug('take focus')
      return () => {
        // when closed / unmounted, release focus
        options._debug('release focus')
        focused.releaseFocus()
      }
    }
  }, [options.state.isOpen])

  // child of us
  const childHasFocusRef = useRef(false)
  return {
    childHasFocusRef: childHasFocusRef,
    childPopoverLock: {
      takeFocus() {
        childHasFocusRef.current = true
        return {
          releaseFocus() {
            childHasFocusRef.current = false
          },
        }
      },
    },
  }
}
