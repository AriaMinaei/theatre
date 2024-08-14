import type {$FixMe} from '@theatre/shared/utils/types'
import {useLayoutEffect, useRef} from 'react'
import {useCssCursorLock} from './PointerEventsHandler'
import type {CapturedPointer} from '@theatre/studio/UIRoot/PointerCapturing'
import {usePointerCapturing} from '@theatre/studio/UIRoot/PointerCapturing'
import noop from '@theatre/shared/utils/noop'
import {isSafari} from './isSafari'
import useRefAndState from '@theatre/studio/utils/useRefAndState'

export enum MouseButton {
  Left = 0,
  Middle = 1,
  // Not including Right because it _might_ interfere with chord clicking.
  // So we'll wait for chord-clicking to land before exploring right-button gestures
}

/**
 * dx, dy: delta x/y from the start of the drag
 *
 * Total movement since the start of the drag. This is commonly used with something like "drag keyframe" or "drag handle",
 * where you might be dragging an item around in the UI.
 * @param totalDragDeltaX - x moved total
 * @param totalDragDeltaY - y moved total
 *
 * Movement from the last event / on drag call. This is commonly used with something like "prop nudge".
 * @param dxFromLastEvent - x moved since last event
 * @param dyFromLastEvent - y moved since last event
 */
type OnDragCallback = (
  totalDragDeltaX: number,
  totalDragDeltaY: number,
  event: PointerEvent,
  dxFromLastEvent: number,
  dyFromLastEvent: number,
) => void

type OnClickCallback = (mouseUpEvent: PointerEvent) => void

type OnDragEndCallback = (dragHappened: boolean, event?: PointerEvent) => void

export type UseDragOpts = {
  /**
   * Provide a name for the thing wanting to use the drag helper.
   * This can show up in various errors and potential debug logs to help narrow down.
   */
  debugName: string
  /**
   * Setting it to true will disable the listeners.
   */
  disabled?: boolean
  /**
   * Setting it to true will allow the mouse down events to propagate up
   */
  dontBlockMouseDown?: boolean
  /**
   * Tells the browser to take control of the mouse pointer so that
   * the user can drag endlessly in any direction without hitting the
   * side of their screen.
   *
   * Note: that if we detect that the browser is
   * safari then pointer lock is not used because the pointer lock
   * banner annoyingly shifts the entire page down.
   *
   * ref: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API
   */
  shouldPointerLock?: boolean
  /**
   * The css cursor property during the gesture will be locked to this value
   */
  lockCSSCursorTo?: string
  /**
   * Called at the start of the gesture. Mind you, that this would be called, even
   * if the user is just clicking (and not dragging). However, if the gesture turns
   * out to be a click, then `onDragEnd(false)` will be called. Otherwise,
   * a series of `onDrag(dx, dy, event)` events will be called, and the
   * gesture will end with `onDragEnd(true)`.
   *
   *
   * @returns
   * onDragStart can be undefined, in which case, we always handle useDrag,
   * but when defined, we can allow the handler to return false to indicate ignore this dragging
   */
  onDragStart: (event: PointerEvent ) =>
    | false
    | {
        /**
         * Called at the end of the drag gesture.
         * `dragHappened` will be `true` if the user actually moved the pointer
         * (if onDrag isn't called, then this will be false becuase the user hasn't moved the pointer)
         */
        onDragEnd?: OnDragEndCallback
        onDrag: OnDragCallback
        onClick?: OnClickCallback
      }

  // which mouse button to use the drag event
  buttons?:
    | [MouseButton]
    | [MouseButton, MouseButton]
    | [MouseButton | MouseButton | MouseButton]
}

/** How far in total does the cursor have to move before we decide that the user is dragging */
const DRAG_DETECTION_DISTANCE_THRESHOLD = 3
const DRAG_DETECTION_WAS_POINTER_LOCK_MOVEMENT = 100

type IUseDragStateRef = IUseDragState_NotStarted | IUseDragState_Started

type IUseDragState_NotStarted = {
  /** We have not yet encountered a `"dragstart"` event. */
  domDragStarted: false
}

type IUseDragState_Started = {
  /** We have encountered a `"dragstart"` event. */
  domDragStarted: true
  detection:
    | IUseDragStateDetection_Detected
    | IUseDragStateDetection_NotDetected
  /**
   * Used when `isPointerLockUsed` is false, so we can calculate
   * dx / dy based on the difference of the moved pointer from the start position of the pointer.
   *
   * This is generally going to give us a much more accurate estimation than accumulating
   * movementX & movementY values.
   */
  startPos: {
    x: number
    y: number
  }
}
type IUseDragStateDetection_NotDetected = {
  detected: false
  // Used for detection thresholds
  /** Accumulated in all directions */
  totalDistanceMoved: number
}

type IUseDragStateDetection_Detected = {
  detected: true
  dragMovement: {
    x: number
    y: number
  }
  /**
   * Number of drag events since we started guessing this was a drag
   * This is used to determine if requesting pointer lock causes a
   * large change to mouse movement (since on at least FF, requesting
   * pointer lock will move the pointer to the center of the screen)
   */
  dragEventCount: number
}

export default function useDrag(
  target: HTMLElement | SVGElement | undefined | null,
  opts: UseDragOpts,
): [isDragging: boolean] {
  const optsRef = useRef<UseDragOpts>(opts)
  optsRef.current = opts

  /**
   * Safari has a gross behavior with locking the pointer changes the height of the webpage
   * See {@link UseDragOpts.shouldPointerLock} for more context.
   */
  // const isPointerLockUsed = opts.shouldPointerLock && !isSafari
  const isPointerLockUsed = false

  const stateRef = useRef<IUseDragStateRef>({
    domDragStarted: false,
  })

  const {capturePointer} = usePointerCapturing(`useDrag for ${opts.debugName}`)

  const callbacksRef = useRef<{
    onDrag: OnDragCallback
    onDragEnd: OnDragEndCallback
    onClick: OnClickCallback
  }>({onDrag: noop, onDragEnd: noop, onClick: noop})

  const capturedPointerRef = useRef<undefined | CapturedPointer>()
  // needed to have a state on the react lifecycle which can be updated
  // via a ref (e.g. via the below layout effect).
  const [isDraggingRef, isDragging] = useRefAndState(false)
  useLayoutEffect(() => {
    // target?.style.setProperty('touch-action', 'none')
    if (!target) return
    const ensureIsDraggingUpToDateForReactLifecycle = () => {
      const isDragging =
        stateRef.current.domDragStarted && stateRef.current.detection.detected
      if (isDraggingRef.current !== isDragging) {
        isDraggingRef.current = isDragging
      }
    }

    const dragHandler = (event: PointerEvent) => {
      console.log('dragHandler start, probably because of pointerMove')
      // console.log('TOUCHES', event_, event_?.touches, event_?.changedTouches)
      if (!stateRef.current.domDragStarted) return
      console.log('  stateRef.current.domDragStarted')

      const stateStarted = stateRef.current

      if (didPointerLockCauseMovement(event, stateStarted)) return
      console.log('  NOT didPointerLockCauseMovement(event, stateStarted)')

      if (!stateStarted.detection.detected) {
        console.log('  !stateStarted.detection.detected')
        stateStarted.detection.totalDistanceMoved +=
          Math.abs(event.movementY) + Math.abs(event.movementX)

        if (
          stateStarted.detection.totalDistanceMoved >
          DRAG_DETECTION_DISTANCE_THRESHOLD
        ) {
          if (isPointerLockUsed) {
            target.requestPointerLock()
          }

          stateStarted.detection = {
            detected: true,
            dragMovement: {x: 0, y: 0},
            dragEventCount: 0,
          }
          ensureIsDraggingUpToDateForReactLifecycle()
        }
      }

      console.log('  before check stateStarted.detection.detected', stateStarted.detection)
      // drag detection threshold checking
      if (stateStarted.detection.detected) {
        console.log('  stateStarted.detection.detected')
        stateStarted.detection.dragEventCount += 1
        const {dragMovement} = stateStarted.detection
        if (isPointerLockUsed) {
          console.log('  isPointerLockUsed')
          // when locked, the pointer event screen position is going to be 0s, since the pointer can't move.
          // So, we use the movement on the event
          dragMovement.x += event.movementX
          dragMovement.y += event.movementY
          // TODO with mouse pointerdown WE ARE HERE in F1, for MOUSE & TOUCH
        } else {
          console.log('  !isPointerLockUsed')
          const {startPos} = stateStarted
          dragMovement.x = event.screenX - startPos.x
          dragMovement.y = event.screenY - startPos.y
        }

        console.log('  dragMovement after check isPointerLockUsed, before onDrag')
        callbacksRef.current.onDrag(
          dragMovement.x,
          dragMovement.y,
          event,
          event.movementX,
          event.movementY,
        )
        console.log('  callbacksRef.current.onDrag executed')
      }
      console.log('dragHandler end')
    }

    const dragEndHandler = (e: PointerEvent) => {
      console.log('dragEndHandler start')
      removeDragListeners()
      if (!stateRef.current.domDragStarted) return
      const dragHappened = stateRef.current.detection.detected
      stateRef.current = {domDragStarted: false}
      if (opts.shouldPointerLock && !isSafari) document.exitPointerLock()
      callbacksRef.current.onDragEnd(dragHappened)

      // ensure that the window is focused after a successful drag
      // this fixes an issue where after dragging something like the playhead
      // through an iframe, you can immediately hit [space] and the animation
      // will play, even if you hadn't been focusing in the iframe at the start
      // of the drag.
      //
      // Fixes https://linear.app/theatre/issue/P-177/beginners-scrubbing-the-playhead-from-within-an-iframe-then-[space]
      window.focus()

      if (!dragHappened) {
        callbacksRef.current.onClick(e)
      }
      ensureIsDraggingUpToDateForReactLifecycle()
    }

    const addDragListeners = () => {
      // document.addEventListener('mousemove', dragHandler)
      // document.addEventListener('mouseup', dragEndHandler)
      // document.addEventListener('touchmove', dragHandler)
      // document.addEventListener('touchend', dragEndHandler)
      document.addEventListener('pointermove', dragHandler)
      document.addEventListener('pointerup', dragEndHandler)
    }

    const removeDragListeners = () => {
      console.log('removeDragListeners')
      capturedPointerRef.current?.release()
      // document.removeEventListener('mousemove', dragHandler)
      // document.removeEventListener('mouseup', dragEndHandler)
      // document.removeEventListener('touchmove', dragHandler)
      // document.removeEventListener('touchend', dragEndHandler)
      document.removeEventListener('pointermove', dragHandler)
      document.removeEventListener('pointerup', dragEndHandler)
    }

    const preventUnwantedClick = (event: PointerEvent) => {
      console.log('preventUnwantedClick');
      if (optsRef.current.disabled) return
      if (!stateRef.current.domDragStarted) return
      if (stateRef.current.detection.detected) {
        if (!optsRef.current.dontBlockMouseDown) {
          event.stopPropagation()
          event.preventDefault()
        }
        stateRef.current.detection = {
          detected: false,
          totalDistanceMoved: 0,
        }
        ensureIsDraggingUpToDateForReactLifecycle()
      }
    }

    const dragStartHandler = (event: PointerEvent ) => {
      console.log('dragStartHandler start', event);
      // defensively release
      capturedPointerRef.current?.release()

      const opts = optsRef.current
      if (opts.disabled === true) return

      const acceptedButtons: MouseButton[] = opts.buttons ?? [MouseButton.Left]
      console.log('acceptedButtons', acceptedButtons)

      // if ((!acceptedButtons.includes(event.button)) || event.type === 'touchstart') return
      if (!acceptedButtons.includes(event.button)) return
      console.log('event is accepted')

      const returnOfOnDragStart = opts.onDragStart(event)

      if (returnOfOnDragStart === false) {
        console.log('returnOfOnDragStart === false')
        // we should ignore the gesture
        return
      }
      console.log(returnOfOnDragStart)

      callbacksRef.current.onDrag = returnOfOnDragStart.onDrag
      callbacksRef.current.onDragEnd = returnOfOnDragStart.onDragEnd ?? noop
      callbacksRef.current.onClick = returnOfOnDragStart.onClick ?? noop

      // need to capture pointer after we know the provided handler wants to handle drag start
      console.log('---------- ', event.pointerType, event) // pointerType is either mouse or touch
      // if (true || (event?.pointerType == 'mouse')) {capturedPointerRef.current = capturePointer('Drag start')}
      capturedPointerRef.current = capturePointer('Drag start')

      console.log('opts.dontBlockMouseDown', opts.dontBlockMouseDown)
      if (!opts.dontBlockMouseDown) {
        event.stopPropagation()
        event.preventDefault()
      }
      
      console.log('startPos event.screenX, y: event.screenY', event.screenX, event.screenY)

      stateRef.current = {
        domDragStarted: true,
        startPos: {x: event.screenX, y: event.screenY},
        detection: {
          detected: false,
          totalDistanceMoved: 0,
        },
      }
      ensureIsDraggingUpToDateForReactLifecycle()

      console.log('addDragListeners')
      addDragListeners()
    }

    const onMouseDown = (e: PointerEvent) => {
      console.log('onMouseDown dragStartHandler')
      dragStartHandler(e)
    }

    // target.addEventListener('mousedown', onMouseDown as $FixMe)
    // target.addEventListener('touchstart', onMouseDown as $FixMe)
    target.addEventListener('pointerdown', onMouseDown as $FixMe)
    target.addEventListener('click', preventUnwantedClick as $FixMe)

    return () => {
      console.log('dragstart uselayout beginning')
      removeDragListeners()
      // target.removeEventListener('mousedown', onMouseDown as $FixMe)
      // target.removeEventListener('touchstart', onMouseDown as $FixMe)
      target.removeEventListener('pointerdown', onMouseDown as $FixMe)
      target.removeEventListener('click', preventUnwantedClick as $FixMe)

      if (stateRef.current.domDragStarted) {
        callbacksRef.current.onDragEnd?.(stateRef.current.detection.detected)
      }
      stateRef.current = {domDragStarted: false}
      ensureIsDraggingUpToDateForReactLifecycle()
    }
  }, [target])

  useCssCursorLock(
    isDragging && !!opts.lockCSSCursorTo,
    'dragging',
    opts.lockCSSCursorTo,
  )

  return [isDragging]
}

/**
 * shouldPointerLock moves the mouse to the center of your screen in firefox, which
 * can cause it to report very large movementX when the pointer lock begins. This
 * function hackily detects unnaturally large movements of the mouse.
 *
 * @param event - MouseEvent from onDrag
 * @returns
 */
function didPointerLockCauseMovement(
  event: PointerEvent,
  state: IUseDragState_Started,
) {
  console.log('didPointerLockCauseMovement');
  const isEarlyInDragging =
    !state.detection.detected ||
    (state.detection.detected && state.detection.dragEventCount < 3)

  return (
    isEarlyInDragging &&
    // sudden movement
    (Math.abs(event.movementX) > DRAG_DETECTION_WAS_POINTER_LOCK_MOVEMENT ||
      Math.abs(event.movementY) > DRAG_DETECTION_WAS_POINTER_LOCK_MOVEMENT)
  )
}
