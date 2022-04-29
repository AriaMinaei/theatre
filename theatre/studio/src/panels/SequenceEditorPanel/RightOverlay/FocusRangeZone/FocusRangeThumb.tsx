import type {Pointer} from '@theatre/dataverse'
import {prism, val} from '@theatre/dataverse'
import {usePrism} from '@theatre/react'
import type {$IntentionalAny, IRange} from '@theatre/shared/utils/types'
import getStudio from '@theatre/studio/getStudio'
import type {SequenceEditorPanelLayout} from '@theatre/studio/panels/SequenceEditorPanel/layout/layout'
import {topStripHeight} from '@theatre/studio/panels/SequenceEditorPanel/RightOverlay/TopStrip'
import type {CommitOrDiscard} from '@theatre/studio/StudioStore/StudioStore'
import {useCssCursorLock} from '@theatre/studio/uiComponents/PointerEventsHandler'
import useDrag from '@theatre/studio/uiComponents/useDrag'
import useRefAndState from '@theatre/studio/utils/useRefAndState'
import React, {useMemo} from 'react'
import styled from 'styled-components'
import {
  attributeNameThatLocksFramestamp,
  useLockFrameStampPosition,
} from '@theatre/studio/panels/SequenceEditorPanel/FrameStampPositionProvider'
import {focusRangeStripTheme, RangeStrip} from './FocusRangeStrip'
import SnapCursor from '@theatre/studio/panels/SequenceEditorPanel/DopeSheet/Right/BasicKeyframedTrack/KeyframeEditor/SnapCursor.svg'
import type Sheet from '@theatre/core/sheets/Sheet'

const snapCursorSize = 42

const TheDiv = styled.div<{enabled: boolean; type: 'start' | 'end'}>`
  position: absolute;
  top: 0;
  // the right handle has to be pulled back by its width since its right side indicates its position, not its left side
  left: ${(props) =>
    props.type === 'start' ? 0 : -focusRangeStripTheme.thumbWidth}px;
  transform-origin: left top;
  width: ${focusRangeStripTheme.thumbWidth}px;
  height: ${() => topStripHeight - 1}px;
  z-index: 3;

  background-color: ${({enabled}) =>
    enabled
      ? focusRangeStripTheme.enabled.backgroundColor
      : focusRangeStripTheme.disabled.backgroundColor};

  stroke: ${focusRangeStripTheme.enabled.stroke};
  user-select: none;

  cursor: ${(props) => (props.type === 'start' ? 'w-resize' : 'e-resize')};

  // no pointer events unless pointer-root is in normal mode _and_ the
  // focus range is enabled
  #pointer-root & {
    pointer-events: none;
  }

  #pointer-root.normal & {
    pointer-events: ${(props) => (props.enabled ? 'auto' : 'none')};
  }

  #pointer-root.draggingPositionInSequenceEditor & {
    pointer-events: auto;
    cursor: none;

    &:hover:after {
      position: absolute;
      top: calc(50% - ${snapCursorSize / 2}px);
      left: calc(50% - ${snapCursorSize / 2}px);
      width: ${snapCursorSize}px;
      height: ${snapCursorSize}px;
      display: block;
      content: ' ';
      background: url(${SnapCursor}) no-repeat;
      background-size: cover;
      z-index: 30;
    }
  }

  &.dragging {
    pointer-events: none !important;
  }

  // highlight the handle when it's being dragged or the whole strip is being dragged
  &.dragging,
  ${() => RangeStrip}.dragging ~ & {
    background: ${focusRangeStripTheme.dragging.backgroundColor};
    stroke: ${focusRangeStripTheme.dragging.stroke};
  }

  #pointer-root.draggingPositionInSequenceEditor &:hover {
    background: ${focusRangeStripTheme.dragging.backgroundColor};
    stroke: #40aaa4;
  }

  // highlight the handle if it's hovered, or the whole strip is hovverd
  ${() => RangeStrip}:hover ~ &, &:hover {
    background: ${focusRangeStripTheme.hover.backgroundColor};
    stroke: ${focusRangeStripTheme.hover.stroke};
  }

  // a larger hit zone
  &:before {
    display: block;
    content: ' ';
    position: absolute;
    inset: -8px;
  }
`

const FocusRangeThumb: React.FC<{
  layoutP: Pointer<SequenceEditorPanelLayout>
  thumbType: keyof IRange
}> = ({layoutP, thumbType}) => {
  const [hitZoneRef, hitZoneNode] = useRefAndState<HTMLElement | null>(null)

  const existingRangeD = useMemo(
    () =>
      prism(() => {
        const {projectId, sheetId} = val(layoutP.sheet).address
        const existingRange = val(
          getStudio().atomP.ahistoric.projects.stateByProjectId[projectId]
            .stateBySheetId[sheetId].sequence.focusRange,
        )
        return existingRange
      }),
    [layoutP],
  )

  const gestureHandlers = useMemo((): Parameters<typeof useDrag>[1] => {
    let defaultRange: IRange
    let range: IRange
    let focusRangeEnabled: boolean
    let posBeforeDrag: number
    let tempTransaction: CommitOrDiscard | undefined
    let minFocusRangeStripWidth: number
    let sheet: Sheet
    let scaledSpaceToUnitSpace: (s: number) => number

    return {
      onDragStart() {
        sheet = val(layoutP.sheet)
        const sequence = sheet.getSequence()
        defaultRange = {start: 0, end: sequence.length}
        let existingRange = existingRangeD.getValue() || {
          range: defaultRange,
          enabled: false,
        }
        focusRangeEnabled = existingRange.enabled

        posBeforeDrag = existingRange.range[thumbType]
        scaledSpaceToUnitSpace = val(layoutP.scaledSpace.toUnitSpace)
        minFocusRangeStripWidth = scaledSpaceToUnitSpace(
          focusRangeStripTheme.rangeStripMinWidth,
        )
      },
      onDrag(dx, _, event) {
        range = existingRangeD.getValue()?.range || defaultRange

        const deltaPos = scaledSpaceToUnitSpace(dx)
        let newPosition: number
        const oldPosPlusDeltaPos = posBeforeDrag + deltaPos

        // Make sure that the focus range has a minimal width
        if (thumbType === 'start') {
          // Prevent the start thumb from going below 0
          newPosition = Math.max(
            Math.min(
              oldPosPlusDeltaPos,
              range['end'] - minFocusRangeStripWidth,
            ),
            0,
          )
        } else {
          // Prevent the start thumb from going over the length of the sequence
          newPosition = Math.min(
            Math.max(
              oldPosPlusDeltaPos,
              range['start'] + minFocusRangeStripWidth,
            ),
            sheet.getSequence().length,
          )
        }

        // Enable snapping
        const snapTarget = event
          .composedPath()
          .find(
            (el): el is Element =>
              el instanceof Element &&
              el !== hitZoneNode &&
              el.hasAttribute('data-pos'),
          )

        if (snapTarget) {
          const snapPos = parseFloat(snapTarget.getAttribute('data-pos')!)

          if (isFinite(snapPos)) {
            newPosition = snapPos
          }
        }

        const newPositionInFrame = sheet
          .getSequence()
          .closestGridPosition(newPosition)

        if (tempTransaction !== undefined) {
          tempTransaction.discard()
        }

        tempTransaction = getStudio().tempTransaction(({stateEditors}) => {
          stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId.sequence.focusRange.set(
            {
              ...sheet.address,
              range: {...range, [thumbType]: newPositionInFrame},
              enabled: focusRangeEnabled,
            },
          )
        })
      },
      onDragEnd(dragHappened) {
        if (dragHappened && tempTransaction !== undefined) {
          tempTransaction.commit()
        } else if (tempTransaction) {
          tempTransaction.discard()
        }
      },
      lockCursorTo: thumbType === 'start' ? 'w-resize' : 'e-resize',
    }
  }, [layoutP])

  const [isDragging] = useDrag(hitZoneNode, gestureHandlers)

  useCssCursorLock(
    isDragging,
    'draggingPositionInSequenceEditor',
    thumbType === 'start' ? 'w-resize' : 'e-resize',
  )

  useLockFrameStampPosition(isDragging, -1)

  return usePrism(() => {
    const existingRange = existingRangeD.getValue()
    if (!existingRange) return null
    const {enabled} = existingRange

    const position = existingRange.range[thumbType]

    let posInClippedSpace: number = val(layoutP.clippedSpace.fromUnitSpace)(
      position,
    )

    if (
      posInClippedSpace < 0 ||
      val(layoutP.clippedSpace.width) < posInClippedSpace
    ) {
      posInClippedSpace = -10000
    }

    return (
      <TheDiv
        ref={hitZoneRef as $IntentionalAny}
        data-pos={position.toFixed(3)}
        {...{
          [attributeNameThatLocksFramestamp]: position.toFixed(3),
        }}
        className={`${isDragging && 'dragging'} ${enabled && 'enabled'}`}
        enabled={enabled}
        type={thumbType}
        style={{
          transform: `translate3d(${posInClippedSpace}px, 0, 0)`,
        }}
      >
        <svg viewBox="0 0 9 18" xmlns="http://www.w3.org/2000/svg">
          <line x1="4" y1="6" x2="4" y2="12" />
          <line x1="6" y1="6" x2="6" y2="12" />
        </svg>
      </TheDiv>
    )
  }, [layoutP, hitZoneRef, existingRangeD, isDragging])
}

export default FocusRangeThumb
