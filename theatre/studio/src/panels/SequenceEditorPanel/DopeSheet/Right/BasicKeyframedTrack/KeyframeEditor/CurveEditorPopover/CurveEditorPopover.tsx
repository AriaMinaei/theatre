import type {Pointer} from '@theatre/dataverse'
import type {KeyboardEvent} from 'react'
import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import styled from 'styled-components'
import fuzzy from 'fuzzy'
import type {SequenceEditorPanelLayout} from '@theatre/studio/panels/SequenceEditorPanel/layout/layout'
import getStudio from '@theatre/studio/getStudio'
import type {CommitOrDiscard} from '@theatre/studio/StudioStore/StudioStore'
import type KeyframeEditor from '@theatre/studio/panels/SequenceEditorPanel/DopeSheet/Right/BasicKeyframedTrack/KeyframeEditor/KeyframeEditor'
import CurveSegmentEditor from './CurveSegmentEditor'
import EasingOption from './EasingOption'
import type {CSSCubicBezierArgsString, CubicBezierHandles} from './shared'
import {
  cssCubicBezierArgsFromHandles,
  handlesFromCssCubicBezierArgs,
  EASING_PRESETS,
  areEasingsSimilar,
} from './shared'
import {COLOR_BASE, COLOR_POPOVER_BACK} from './colors'
import useRefAndState from '@theatre/studio/utils/useRefAndState'
import type {Keyframe} from '@theatre/core/projects/store/types/SheetState_Historic'
import {useUIOptionGrid, Outcome} from './useUIOptionGrid'
import {useVal} from '@theatre/react'
import {
  flatSelectionTrackIds,
  selectedKeyframeConnections,
} from '@theatre/studio/panels/SequenceEditorPanel/DopeSheet/selections'

const PRESET_COLUMNS = 3
const PRESET_SIZE = 53

const APPROX_TOOLTIP_HEIGHT = 25

const Grid = styled.div`
  background: ${COLOR_POPOVER_BACK};
  display: grid;
  grid-template-areas:
    'search  tween'
    'presets tween';
  grid-template-rows: 32px 1fr;
  grid-template-columns: ${PRESET_COLUMNS * PRESET_SIZE}px 120px;
  gap: 1px;
  height: 120px;
`

const OptionsContainer = styled.div`
  overflow: auto;
  grid-area: presets;

  display: grid;
  grid-template-columns: repeat(${PRESET_COLUMNS}, 1fr);
  grid-auto-rows: min-content;
  gap: 1px;

  overflow-y: scroll;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* Internet Explorer 10+ */
  &::-webkit-scrollbar {
    /* WebKit */
    width: 0;
    height: 0;
  }
`

const SearchBox = styled.input.attrs({type: 'text'})`
  background-color: ${COLOR_BASE};
  border: none;
  border-radius: 2px;
  color: rgba(255, 255, 255, 0.8);
  padding: 6px;
  font-size: 12px;
  outline: none;
  cursor: text;
  text-align: left;
  width: 100%;
  height: 100%;
  box-sizing: border-box;

  grid-area: search;

  &:hover {
    background-color: #212121;
  }

  &:focus {
    background-color: rgba(16, 16, 16, 0.26);
    outline: 1px solid rgba(0, 0, 0, 0.35);
  }
`

const CurveEditorContainer = styled.div`
  grid-area: tween;
  background: ${COLOR_BASE};
`

const NoResultsFoundContainer = styled.div`
  grid-column: 1 / 4;
  padding: 6px;
  color: #888888;
`
/**
 * Tracking for what kinds of events are allowed to change the input's value.
 */
enum TextInputMode {
  /**
   * Initial mode, don't try to override the value.
   */
  init,
  /**
   * In `user` mode, the text input field does not update when the curve
   * changes so that the user's search is preserved.
   */
  user,
  /**
   * In `auto` mode, the text input field is continually updated to
   * a CSS cubic bezier args string to reflect the state of the curve.
   */
  auto,
  multipleValues,
}

type IProps = {
  layoutP: Pointer<SequenceEditorPanelLayout>

  /**
   * Called when user hits enter/escape
   */
  onRequestClose: (reason: string) => void
} & Parameters<typeof KeyframeEditor>[0]

const CurveEditorPopover: React.FC<IProps> = (props) => {
  ////// `tempTransaction` //////
  /*
   * `tempTransaction` is used for all edits in this popover. The transaction
   * is discared if the user presses escape, otherwise it is committed when the
   * popover closes.
   */
  const tempTransaction = useRef<CommitOrDiscard | null>(null)
  useEffect(() => {
    const isOpenT = getStudio().tempTransaction(({stateEditors}) =>
      stateEditors.studio.ephemeral.projects.stateByProjectId.setIsCurveEditorPopoverOpen(
        {...props.leaf.sheetObject.address, isCurveEditorPopoverOpen: true},
      ),
    )
    // Clean-up function, called when this React component unmounts.
    // When it unmounts, we want to commit edits that are outstanding
    return () => {
      isOpenT.discard()
      tempTransaction.current?.commit()
    }
  }, [tempTransaction])

  ////// Keyframe and trackdata //////
  const {index, trackData} = props
  const cur = trackData.keyframes[index]
  const next = trackData.keyframes[index + 1]
  const easing: CubicBezierHandles = [
    trackData.keyframes[index].handles[2],
    trackData.keyframes[index].handles[3],
    trackData.keyframes[index + 1].handles[0],
    trackData.keyframes[index + 1].handles[1],
  ]

  ////// Text input data and reactivity //////
  const inputRef = useRef<HTMLInputElement>(null)

  // Select the easing string on popover open for quick copy&paste
  useLayoutEffect(() => {
    inputRef.current?.select()
    inputRef.current?.focus()
  }, [inputRef.current])

  const [inputValue, setInputValue] = useState<string>(
    cssCubicBezierArgsFromHandles(easing),
  )

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInputMode(TextInputMode.user)
    setInputValue(e.target.value)

    const maybeHandles = handlesFromCssCubicBezierArgs(e.target.value)
    if (maybeHandles) setEdit(e.target.value)
  }
  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    setTextInputMode(TextInputMode.user)
    // Prevent scrolling on arrow key press
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') e.preventDefault()

    if (e.key === 'ArrowDown') {
      grid.focusFirstItem()
      optionsRef.current[displayedPresets[0].label]?.current?.focus()
    } else if (e.key === 'Escape') {
      discardTempValue(tempTransaction)
      props.onRequestClose('key Escape')
    } else if (e.key === 'Enter') {
      props.onRequestClose('key Enter')
    }
  }

  const [textInputMode, setTextInputMode] = useState<TextInputMode>(
    TextInputMode.init,
  )
  useEffect(() => {
    if (textInputMode === TextInputMode.auto) {
      setInputValue(cssCubicBezierArgsFromHandles(easing))
    } else if (textInputMode === TextInputMode.multipleValues) {
      if (inputValue !== '') setInputValue('')
    }
  }, [trackData])

  // `edit` keeps track of the current edited state of the curve.
  const [edit, setEdit] = useState<CSSCubicBezierArgsString | null>(
    cssCubicBezierArgsFromHandles(easing),
  )
  // `preview` is used when hovering over a curve to preview it.
  const [preview, setPreview] = useState<CSSCubicBezierArgsString | null>(null)

  // When `preview` or `edit` change, use the `tempTransaction` to change the
  // curve in Theate's data.
  useMemo(() => {
    if (textInputMode !== TextInputMode.init)
      setTempValue(tempTransaction, props, cur, next, preview ?? edit ?? '')
  }, [preview, edit])
  ////// selection stuff //////
  let selectedConnections: Array<[Keyframe, Keyframe]> = useVal(
    selectedKeyframeConnections(
      props.leaf.sheetObject.address.projectId,
      props.leaf.sheetObject.address.sheetId,
      props.selection,
    ),
  )

  if (
    selectedConnections.some(areConnectedKeyframesTheSameAs([cur, next])) &&
    textInputMode === TextInputMode.init
  ) {
    setTextInputMode(TextInputMode.multipleValues)
  }

  //////  Curve editing reactivity //////
  const onCurveChange = (newHandles: CubicBezierHandles) => {
    setTextInputMode(TextInputMode.auto)
    const value = cssCubicBezierArgsFromHandles(newHandles)
    setInputValue(value)
    setEdit(value)

    // ensure that the text input is selected when curve is changing.
    inputRef.current?.select()
    inputRef.current?.focus()
  }
  const onCancelCurveChange = () => {}

  ////// Preset reactivity //////
  const displayedPresets = useMemo(() => {
    const isInputValueAQuery = /^[A-Za-z]/.test(inputValue)

    if (isInputValueAQuery) {
      return fuzzy
        .filter(inputValue, EASING_PRESETS, {
          extract: (el) => el.label,
        })
        .map((result) => result.original)
    } else {
      return EASING_PRESETS
    }
  }, [inputValue])

  // Use the first preset in the search when the displayed presets change
  useEffect(() => {
    if (textInputMode === TextInputMode.user && displayedPresets[0])
      setEdit(displayedPresets[0].value)
  }, [displayedPresets])

  ////// Option grid specification and reactivity //////
  const onEasingOptionKeydown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      discardTempValue(tempTransaction)
      props.onRequestClose('key Escape')
      e.stopPropagation()
    } else if (e.key === 'Enter') {
      props.onRequestClose('key Enter')
      e.stopPropagation()
    }
  }
  const onEasingOptionMouseOver = (item: {label: string; value: string}) =>
    setPreview(item.value)
  const onEasingOptionMouseOut = () => setPreview(null)
  const onSelectEasingOption = (item: {label: string; value: string}) => {
    setTempValue(tempTransaction, props, cur, next, item.value)
    props.onRequestClose('selected easing option')

    return Outcome.Handled
  }

  // A map to store all html elements corresponding to easing options
  const optionsRef = useRef(
    EASING_PRESETS.reduce((acc, curr) => {
      acc[curr.label] = {current: null}

      return acc
    }, {} as {[key: string]: {current: HTMLDivElement | null}}),
  )

  const [optionsContainerRef, optionsContainer] =
    useRefAndState<HTMLDivElement | null>(null)
  // Keep track of option container scroll position
  const [optionsScrollPosition, setOptionsScrollPosition] = useState(0)
  useEffect(() => {
    const listener = () => {
      setOptionsScrollPosition(optionsContainer?.scrollTop ?? 0)
    }
    optionsContainer?.addEventListener('scroll', listener)
    return () => optionsContainer?.removeEventListener('scroll', listener)
  }, [optionsContainer])

  const grid = useUIOptionGrid({
    items: displayedPresets,
    uiColumns: 3,
    onSelectItem: onSelectEasingOption,
    canVerticleExit(exitSide) {
      if (exitSide === 'top') {
        inputRef.current?.select()
        inputRef.current?.focus()
        return Outcome.Handled
      }
      return Outcome.Passthrough
    },
    renderItem: ({item: preset, select}) => (
      <EasingOption
        key={preset.label}
        easing={preset}
        tabIndex={0}
        onKeyDown={onEasingOptionKeydown}
        ref={optionsRef.current[preset.label]}
        onMouseOver={() => onEasingOptionMouseOver(preset)}
        onMouseOut={onEasingOptionMouseOut}
        onClick={select}
        tooltipPlacement={
          (optionsRef.current[preset.label].current?.offsetTop ?? 0) -
            (optionsScrollPosition ?? 0) <
          PRESET_SIZE + APPROX_TOOLTIP_HEIGHT
            ? 'bottom'
            : 'top'
        }
        isSelected={areEasingsSimilar(
          easing,
          handlesFromCssCubicBezierArgs(preset.value),
        )}
      />
    ),
  })

  // When the user navigates highlight between presets, focus the preset el and set the
  // easing data to match the highlighted preset
  useLayoutEffect(() => {
    if (
      grid.currentSelection !== null &&
      document.activeElement !== inputRef.current // prevents taking focus away from input
    ) {
      const maybePresetEl =
        optionsRef.current?.[grid.currentSelection.label]?.current
      maybePresetEl?.focus()
      setEdit(grid.currentSelection.value)
      const isInputValueAQuery = /^[A-Za-z]/.test(inputValue)
      if (!isInputValueAQuery) {
        setInputValue(grid.currentSelection.value)
      }
    }
  }, [grid.currentSelection])

  return (
    <Grid>
      <SearchBox
        value={inputValue}
        placeholder={
          textInputMode === TextInputMode.multipleValues
            ? 'Multiple easings selected'
            : 'Search presets...'
        }
        onPaste={setTimeoutFunction(onInputChange)}
        onChange={onInputChange}
        ref={inputRef}
        onKeyDown={onSearchKeyDown}
      />
      <OptionsContainer
        ref={optionsContainerRef}
        onKeyDown={(evt) => grid.onParentEltKeyDown(evt)}
      >
        {grid.gridItems}
        {grid.gridItems.length === 0 ? (
          <NoResultsFoundContainer>No results found</NoResultsFoundContainer>
        ) : undefined}
      </OptionsContainer>
      <CurveEditorContainer onClick={() => inputRef.current?.focus()}>
        <CurveSegmentEditor
          {...props}
          onCurveChange={onCurveChange}
          onCancelCurveChange={onCancelCurveChange}
        />
      </CurveEditorContainer>
    </Grid>
  )
}

export default CurveEditorPopover

function setTempValue(
  tempTransaction: React.MutableRefObject<CommitOrDiscard | null>,
  props: IProps,
  cur: Keyframe,
  next: Keyframe,
  newCurve: string,
): void {
  tempTransaction.current?.discard()
  tempTransaction.current = null

  const handles = handlesFromCssCubicBezierArgs(newCurve)
  if (handles === null) return

  tempTransaction.current = transactionSetCubicBezier(props, cur, next, handles)
}

function discardTempValue(
  tempTransaction: React.MutableRefObject<CommitOrDiscard | null>,
): void {
  tempTransaction.current?.discard()
  tempTransaction.current = null
}

function transactionSetCubicBezier(
  props: IProps,
  cur: Keyframe,
  next: Keyframe,
  handles: CubicBezierHandles,
): CommitOrDiscard {
  return getStudio().tempTransaction(({stateEditors}) => {
    const {setKeyframesHandlesIfConnected} =
      stateEditors.coreByProject.historic.sheetsById.sequence

    // set easing for current connector
    setKeyframesHandlesIfConnected({
      ...props.leaf.sheetObject.address,
      trackId: props.leaf.trackId,
      keyframeIds: [cur.id, next.id],
      handles,
    })

    // set easings for selection
    if (props.selection) {
      for (const {objectKey, trackId, keyframeIds} of flatSelectionTrackIds(
        props.selection,
      )) {
        setKeyframesHandlesIfConnected({
          projectId: props.leaf.sheetObject.address.projectId,
          sheetId: props.leaf.sheetObject.address.sheetId,
          objectKey,
          trackId,
          keyframeIds,
          handles,
        })
      }
    }
  })
}

/**
 * n mod m without negative results e.g. `mod(-1,5) = 4` contrasted with `-1 % 5 = -1`.
 *
 * ref: https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm
 */
export function mod(n: number, m: number) {
  return ((n % m) + m) % m
}

function setTimeoutFunction(f: Function, timeout?: number) {
  return () => setTimeout(f, timeout)
}

function areConnectedKeyframesTheSameAs([kfcur1, kfnext1]: [
  Keyframe,
  Keyframe,
]) {
  return ([kfcur2, kfnext2]: [Keyframe, Keyframe]) =>
    kfcur1.handles[2] !== kfcur2.handles[2] ||
    kfcur1.handles[3] !== kfcur2.handles[3] ||
    kfnext1.handles[0] !== kfnext2.handles[0] ||
    kfnext1.handles[1] !== kfnext2.handles[1]
}
