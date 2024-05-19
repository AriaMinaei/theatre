import type {
  BasicKeyframedTrack,
  HistoricPositionalSequence,
  Keyframe,
  KeyframeType,
  SheetState_Historic,
} from '@theatre/core/projects/store/types/SheetState_Historic'
import type {Drafts} from '@theatre/studio/StudioStore/StudioStore'
import type {
  ProjectAddress,
  PropAddress,
  SheetAddress,
  SheetObjectAddress,
  WithoutSheetInstance,
} from '@theatre/shared/utils/addresses'
import {commonRootOfPathsToProps} from '@theatre/shared/utils/addresses'
import {encodePathToProp} from '@theatre/shared/utils/addresses'
import type {
  StudioSheetItemKey,
  KeyframeId,
  SequenceMarkerId,
  SequenceTrackId,
  UIPanelId,
} from '@theatre/shared/utils/ids'
import {
  generateKeyframeId,
  generateSequenceTrackId,
} from '@theatre/shared/utils/ids'
import removePathFromObject from '@theatre/shared/utils/removePathFromObject'
import {transformNumber} from '@theatre/shared/utils/transformNumber'
import type {
  IRange,
  SerializableMap,
  SerializablePrimitive,
  SerializableValue,
} from '@theatre/shared/utils/types'
import {current} from 'immer'
import findLastIndex from 'lodash-es/findLastIndex'
import keyBy from 'lodash-es/keyBy'
import pullFromArray from 'lodash-es/pull'
import set from 'lodash-es/set'
import sortBy from 'lodash-es/sortBy'
import {graphEditorColors} from '@theatre/studio/panels/SequenceEditorPanel/GraphEditor/GraphEditor'
import type {
  KeyframeWithPathToPropFromCommonRoot,
  OutlineSelectable,
  OutlineSelectionState,
  PanelPosition,
  StudioAhistoricState,
  StudioEphemeralState,
  StudioHistoricStateSequenceEditorMarker,
} from './types'
import {clamp, uniq} from 'lodash-es'
import {
  isProject,
  isSheet,
  isSheetObject,
  isSheetObjectTemplate,
  isSheetTemplate,
} from '@theatre/shared/instanceTypes'
import type SheetTemplate from '@theatre/core/sheets/SheetTemplate'
import type SheetObjectTemplate from '@theatre/core/sheetObjects/SheetObjectTemplate'
import type {PropTypeConfig} from '@theatre/core/propTypes'
import {pointableSetUtil} from '@theatre/shared/utils/PointableSet'

export const setDrafts__onlyMeantToBeCalledByTransaction = (
  drafts: undefined | Drafts,
): typeof stateEditors => {
  currentDrafts = drafts
  return stateEditors
}

let currentDrafts: undefined | Drafts

const drafts = (): Drafts => {
  if (currentDrafts === undefined) {
    throw new Error(
      `Calling stateEditors outside of a transaction is not allowed.`,
    )
  }

  return currentDrafts
}

namespace stateEditors {
  export namespace studio {
    export namespace historic {
      export namespace panelPositions {
        export function setPanelPosition(p: {
          panelId: UIPanelId
          position: PanelPosition
        }) {
          const h = drafts().historic
          h.panelPositions ??= {}
          h.panelPositions[p.panelId] = p.position
        }
      }
      export namespace panels {
        export function _ensure() {
          drafts().historic.panels ??= {}
          return drafts().historic.panels!
        }

        export namespace outline {
          export function _ensure() {
            const panels = stateEditors.studio.historic.panels._ensure()
            panels.outlinePanel ??= {}
            return panels.outlinePanel!
          }
          export namespace selection {
            export function set(
              selection: (
                | OutlineSelectable
                | SheetTemplate
                | SheetObjectTemplate
              )[],
            ) {
              const newSelectionState: OutlineSelectionState[] = []

              for (const item of uniq(selection)) {
                if (isProject(item)) {
                  newSelectionState.push({type: 'Project', ...item.address})
                } else if (isSheet(item)) {
                  newSelectionState.push({
                    type: 'Sheet',
                    ...item.template.address,
                  })
                  stateEditors.studio.historic.projects.stateByProjectId.stateBySheetId.setSelectedInstanceId(
                    item.address,
                  )
                } else if (isSheetTemplate(item)) {
                  newSelectionState.push({type: 'Sheet', ...item.address})
                } else if (isSheetObject(item)) {
                  newSelectionState.push({
                    type: 'SheetObject',
                    ...item.template.address,
                  })
                  stateEditors.studio.historic.projects.stateByProjectId.stateBySheetId.setSelectedInstanceId(
                    item.sheet.address,
                  )
                } else if (isSheetObjectTemplate(item)) {
                  newSelectionState.push({type: 'SheetObject', ...item.address})
                }
              }
              outline._ensure().selection = newSelectionState
            }

            export function unset() {
              outline._ensure().selection = []
            }
          }
        }

        export namespace sequenceEditor {
          export function _ensure() {
            const panels = stateEditors.studio.historic.panels._ensure()
            panels.sequenceEditor ??= {}
            return panels.sequenceEditor!
          }
          export namespace graphEditor {
            function _ensure() {
              const s = sequenceEditor._ensure()
              s.graphEditor ??= {height: 0.5, isOpen: false}
              return s.graphEditor!
            }
            export function setIsOpen(p: {isOpen: boolean}) {
              _ensure().isOpen = p.isOpen
            }
          }
        }
      }
      export namespace projects {
        export namespace stateByProjectId {
          export function _ensure(p: ProjectAddress) {
            const s = drafts().historic
            if (!s.projects.stateByProjectId[p.projectId]) {
              s.projects.stateByProjectId[p.projectId] = {
                stateBySheetId: {},
              }
            }

            return s.projects.stateByProjectId[p.projectId]!
          }

          export namespace stateBySheetId {
            export function _ensure(p: WithoutSheetInstance<SheetAddress>) {
              const projectState =
                stateEditors.studio.historic.projects.stateByProjectId._ensure(
                  p,
                )
              if (!projectState.stateBySheetId[p.sheetId]) {
                projectState.stateBySheetId[p.sheetId] = {
                  selectedInstanceId: undefined,
                  sequenceEditor: {
                    selectedPropsByObject: {},
                  },
                }
              }

              return projectState.stateBySheetId[p.sheetId]!
            }

            export function setSelectedInstanceId(p: SheetAddress) {
              stateEditors.studio.historic.projects.stateByProjectId.stateBySheetId._ensure(
                p,
              ).selectedInstanceId = p.sheetInstanceId
            }

            export namespace sequenceEditor {
              export function addPropToGraphEditor(
                p: WithoutSheetInstance<PropAddress>,
              ) {
                const {selectedPropsByObject} =
                  stateBySheetId._ensure(p).sequenceEditor
                if (!selectedPropsByObject[p.objectKey]) {
                  selectedPropsByObject[p.objectKey] = {}
                }
                const selectedProps = selectedPropsByObject[p.objectKey]!

                const path = encodePathToProp(p.pathToProp)

                const possibleColors = new Set<string>(
                  Object.keys(graphEditorColors),
                )
                for (const [_, selectedProps] of Object.entries(
                  current(selectedPropsByObject),
                )) {
                  // debugger
                  for (const [_, takenColor] of Object.entries(
                    selectedProps!,
                  )) {
                    possibleColors.delete(takenColor!)
                  }
                }

                const color =
                  possibleColors.size > 0
                    ? possibleColors.values().next().value
                    : Object.keys(graphEditorColors)[0]

                selectedProps[path] = color
              }

              export function removePropFromGraphEditor(
                p: WithoutSheetInstance<PropAddress>,
              ) {
                const {selectedPropsByObject} =
                  stateBySheetId._ensure(p).sequenceEditor
                if (!selectedPropsByObject[p.objectKey]) {
                  return
                }
                const selectedProps = selectedPropsByObject[p.objectKey]!

                const path = encodePathToProp(p.pathToProp)

                if (selectedProps[path]) {
                  removePathFromObject(selectedPropsByObject, [
                    p.objectKey,
                    path,
                  ])
                }
              }

              function _ensureMarkers(sheetAddress: SheetAddress) {
                const sequenceEditor =
                  stateEditors.studio.historic.projects.stateByProjectId.stateBySheetId._ensure(
                    sheetAddress,
                  ).sequenceEditor

                if (!sequenceEditor.markerSet) {
                  sequenceEditor.markerSet = pointableSetUtil.create()
                }

                return sequenceEditor.markerSet
              }

              export function replaceMarkers(p: {
                sheetAddress: SheetAddress
                markers: Array<StudioHistoricStateSequenceEditorMarker>
                snappingFunction: (p: number) => number
              }) {
                const currentMarkerSet = _ensureMarkers(p.sheetAddress)

                const sanitizedMarkers = p.markers
                  .filter((marker) => {
                    if (!isFinite(marker.position)) return false

                    return true // marker looks valid
                  })
                  .map((marker) => ({
                    ...marker,
                    position: p.snappingFunction(marker.position),
                  }))

                const newMarkersById = keyBy(sanitizedMarkers, 'id')

                /** Usually starts as the "unselected" markers */
                let markersThatArentBeingReplaced = pointableSetUtil.filter(
                  currentMarkerSet,
                  (marker) => marker && !newMarkersById[marker.id],
                )

                const markersThatArentBeingReplacedByPosition = keyBy(
                  Object.values(markersThatArentBeingReplaced.byId),
                  'position',
                )

                // If the new transformed markers overlap with any existing markers,
                // we remove the overlapped markers
                sanitizedMarkers.forEach(({position}) => {
                  const existingMarkerAtThisPosition =
                    markersThatArentBeingReplacedByPosition[position]
                  if (existingMarkerAtThisPosition) {
                    markersThatArentBeingReplaced = pointableSetUtil.remove(
                      markersThatArentBeingReplaced,
                      existingMarkerAtThisPosition.id,
                    )
                  }
                })

                Object.assign(
                  currentMarkerSet,
                  pointableSetUtil.merge([
                    markersThatArentBeingReplaced,
                    pointableSetUtil.create(
                      sanitizedMarkers.map((marker) => [marker.id, marker]),
                    ),
                  ]),
                )
              }

              export function removeMarker(options: {
                sheetAddress: SheetAddress
                markerId: SequenceMarkerId
              }) {
                const currentMarkerSet = _ensureMarkers(options.sheetAddress)
                Object.assign(
                  currentMarkerSet,
                  pointableSetUtil.remove(currentMarkerSet, options.markerId),
                )
              }

              export function updateMarker(options: {
                sheetAddress: SheetAddress
                markerId: SequenceMarkerId
                label: string
              }) {
                const currentMarkerSet = _ensureMarkers(options.sheetAddress)
                const marker = currentMarkerSet.byId[options.markerId]
                if (marker !== undefined) marker.label = options.label
              }
            }
          }
        }
      }
    }
    export namespace ephemeral {
      export function setShowOutline(
        showOutline: StudioEphemeralState['showOutline'],
      ) {
        drafts().ephemeral.showOutline = showOutline
      }
      export namespace projects {
        export namespace stateByProjectId {
          export function _ensure(p: ProjectAddress) {
            const s = drafts().ephemeral
            if (!s.projects.stateByProjectId[p.projectId]) {
              s.projects.stateByProjectId[p.projectId] = {
                stateBySheetId: {},
              }
            }

            return s.projects.stateByProjectId[p.projectId]!
          }

          export namespace stateBySheetId {
            export function _ensure(p: WithoutSheetInstance<SheetAddress>) {
              const projectState =
                stateEditors.studio.ephemeral.projects.stateByProjectId._ensure(
                  p,
                )
              if (!projectState.stateBySheetId[p.sheetId]) {
                projectState.stateBySheetId[p.sheetId] = {
                  stateByObjectKey: {},
                }
              }

              return projectState.stateBySheetId[p.sheetId]!
            }

            export namespace stateByObjectKey {
              export function _ensure(
                p: WithoutSheetInstance<SheetObjectAddress>,
              ) {
                const s =
                  stateEditors.studio.ephemeral.projects.stateByProjectId.stateBySheetId._ensure(
                    p,
                  ).stateByObjectKey
                s[p.objectKey] ??= {}
                return s[p.objectKey]!
              }
              export namespace propsBeingScrubbed {
                export function _ensure(
                  p: WithoutSheetInstance<SheetObjectAddress>,
                ) {
                  const s =
                    stateEditors.studio.ephemeral.projects.stateByProjectId.stateBySheetId.stateByObjectKey._ensure(
                      p,
                    )

                  s.valuesBeingScrubbed ??= {}
                  return s.valuesBeingScrubbed!
                }
                export function flag(p: WithoutSheetInstance<PropAddress>) {
                  set(_ensure(p), p.pathToProp, true)
                }
              }
            }
          }
        }
      }
    }
    export namespace ahistoric {
      export function setPinOutline(
        pinOutline: StudioAhistoricState['pinOutline'],
      ) {
        drafts().ahistoric.pinOutline = pinOutline
      }
      export function setPinDetails(
        pinDetails: StudioAhistoricState['pinDetails'],
      ) {
        drafts().ahistoric.pinDetails = pinDetails
      }
      export function setPinNotifications(
        pinNotifications: StudioAhistoricState['pinNotifications'],
      ) {
        drafts().ahistoric.pinNotifications = pinNotifications
      }
      export function setVisibilityState(
        visibilityState: StudioAhistoricState['visibilityState'],
      ) {
        drafts().ahistoric.visibilityState = visibilityState
      }
      export function setClipboardKeyframes(
        keyframes: KeyframeWithPathToPropFromCommonRoot[],
      ) {
        const commonPath = commonRootOfPathsToProps(
          keyframes.map((kf) => kf.pathToProp),
        )

        const keyframesWithCommonRootPath = keyframes.map(
          ({keyframe, pathToProp}) => ({
            keyframe,
            pathToProp: pathToProp.slice(commonPath.length),
          }),
        )

        // save selection
        const draft = drafts()
        if (draft.ahistoric.clipboard) {
          draft.ahistoric.clipboard.keyframesWithRelativePaths =
            keyframesWithCommonRootPath
        } else {
          draft.ahistoric.clipboard = {
            keyframesWithRelativePaths: keyframesWithCommonRootPath,
          }
        }
      }

      export namespace projects {
        export namespace stateByProjectId {
          export function _ensure(p: ProjectAddress) {
            const s = drafts().ahistoric
            if (!s.projects.stateByProjectId[p.projectId]) {
              s.projects.stateByProjectId[p.projectId] = {
                stateBySheetId: {},
              }
            }

            return s.projects.stateByProjectId[p.projectId]!
          }

          export namespace collapsedItemsInOutline {
            export function _ensure(p: ProjectAddress) {
              const projectState =
                stateEditors.studio.ahistoric.projects.stateByProjectId._ensure(
                  p,
                )
              if (!projectState.collapsedItemsInOutline) {
                projectState.collapsedItemsInOutline = {}
              }
              return projectState.collapsedItemsInOutline!
            }
            export function set(
              p: ProjectAddress & {isCollapsed: boolean; itemKey: string},
            ) {
              const collapsedItemsInOutline =
                stateEditors.studio.ahistoric.projects.stateByProjectId.collapsedItemsInOutline._ensure(
                  p,
                )

              if (p.isCollapsed) {
                collapsedItemsInOutline[p.itemKey] = true
              } else {
                delete collapsedItemsInOutline[p.itemKey]
              }
            }
          }

          export namespace stateBySheetId {
            export function _ensure(p: WithoutSheetInstance<SheetAddress>) {
              const projectState =
                stateEditors.studio.ahistoric.projects.stateByProjectId._ensure(
                  p,
                )
              if (!projectState.stateBySheetId[p.sheetId]) {
                projectState.stateBySheetId[p.sheetId] = {}
              }

              return projectState.stateBySheetId[p.sheetId]!
            }

            export namespace sequence {
              export function _ensure(p: WithoutSheetInstance<SheetAddress>) {
                const sheetState =
                  stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId._ensure(
                    p,
                  )
                if (!sheetState.sequence) {
                  sheetState.sequence = {}
                }
                return sheetState.sequence!
              }

              export namespace focusRange {
                export function set(
                  p: WithoutSheetInstance<SheetAddress> & {
                    range: IRange
                    enabled: boolean
                  },
                ) {
                  stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId.sequence._ensure(
                    p,
                  ).focusRange = {range: p.range, enabled: p.enabled}
                }

                export function unset(p: WithoutSheetInstance<SheetAddress>) {
                  stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId.sequence._ensure(
                    p,
                  ).focusRange = undefined
                }
              }

              export namespace clippedSpaceRange {
                export function set(
                  p: WithoutSheetInstance<SheetAddress> & {
                    range: IRange
                  },
                ) {
                  stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId.sequence._ensure(
                    p,
                  ).clippedSpaceRange = {...p.range}
                }
              }

              export namespace sequenceEditorCollapsableItems {
                function _ensure(p: WithoutSheetInstance<SheetAddress>) {
                  const seq =
                    stateEditors.studio.ahistoric.projects.stateByProjectId.stateBySheetId.sequence._ensure(
                      p,
                    )
                  let existing = seq.collapsableItems
                  if (!existing) {
                    existing = seq.collapsableItems = pointableSetUtil.create()
                  }
                  return existing
                }
                export function set(
                  p: WithoutSheetInstance<SheetAddress> & {
                    studioSheetItemKey: StudioSheetItemKey
                    isCollapsed: boolean
                  },
                ) {
                  const collapsableSet = _ensure(p)
                  Object.assign(
                    collapsableSet,
                    pointableSetUtil.add(collapsableSet, p.studioSheetItemKey, {
                      isCollapsed: p.isCollapsed,
                    }),
                  )
                }
              }
            }
          }
        }
      }
    }
  }
  export namespace coreByProject {
    export namespace historic {
      export namespace revisionHistory {
        export function add(p: ProjectAddress & {revision: string}) {
          const revisionHistory =
            drafts().historic.coreByProject[p.projectId].revisionHistory

          const maxNumOfRevisionsToKeep = 50
          revisionHistory.unshift(p.revision)
          if (revisionHistory.length > maxNumOfRevisionsToKeep) {
            revisionHistory.length = maxNumOfRevisionsToKeep
          }
        }
      }
      export namespace sheetsById {
        export function _ensure(
          p: WithoutSheetInstance<SheetAddress>,
        ): SheetState_Historic {
          const sheetsById =
            drafts().historic.coreByProject[p.projectId].sheetsById

          if (!sheetsById[p.sheetId]) {
            sheetsById[p.sheetId] = {staticOverrides: {byObject: {}}}
          }
          return sheetsById[p.sheetId]!
        }

        export function forgetObject(
          p: WithoutSheetInstance<SheetObjectAddress>,
        ) {
          const sheetState =
            drafts().historic.coreByProject[p.projectId].sheetsById[p.sheetId]
          if (!sheetState) return
          delete sheetState.staticOverrides.byObject[p.objectKey]

          const sequence = sheetState.sequence
          if (!sequence) return
          delete sequence.tracksByObject[p.objectKey]
        }

        export function forgetSheet(p: WithoutSheetInstance<SheetAddress>) {
          const sheetState =
            drafts().historic.coreByProject[p.projectId].sheetsById[p.sheetId]
          if (sheetState) {
            delete drafts().historic.coreByProject[p.projectId].sheetsById[
              p.sheetId
            ]
          }
        }

        export namespace sequence {
          export function _ensure(
            p: WithoutSheetInstance<SheetAddress>,
          ): HistoricPositionalSequence {
            const s = stateEditors.coreByProject.historic.sheetsById._ensure(p)
            s.sequence ??= {
              subUnitsPerUnit: 30,
              length: 10,
              type: 'PositionalSequence',
              tracksByObject: {},
            }

            return s.sequence!
          }

          export function setLength(
            p: WithoutSheetInstance<SheetAddress> & {length: number},
          ) {
            _ensure(p).length = clamp(
              parseFloat(p.length.toFixed(2)),
              0.01,
              Infinity,
            )
          }

          export function setSubUnitsPerUnit(
            p: WithoutSheetInstance<SheetAddress> & {subUnitsPerUnit: number},
          ) {
            _ensure(p).subUnitsPerUnit = clamp(p.subUnitsPerUnit, 1, 2 ** 12)
          }

          function _ensureTracksOfObject(
            p: WithoutSheetInstance<SheetObjectAddress>,
          ) {
            const s =
              stateEditors.coreByProject.historic.sheetsById.sequence._ensure(
                p,
              ).tracksByObject

            s[p.objectKey] ??= {trackData: {}, trackIdByPropPath: {}}

            return s[p.objectKey]!
          }

          export function setPrimitivePropAsSequenced(
            p: WithoutSheetInstance<PropAddress>,
            config: PropTypeConfig,
          ) {
            const tracks = _ensureTracksOfObject(p)
            const pathEncoded = encodePathToProp(p.pathToProp)
            const possibleTrackId = tracks.trackIdByPropPath[pathEncoded]
            if (typeof possibleTrackId === 'string') return

            const trackId = generateSequenceTrackId()

            const track: BasicKeyframedTrack = {
              type: 'BasicKeyframedTrack',
              __debugName: `${p.objectKey}:${pathEncoded}`,
              keyframes: [],
            }

            tracks.trackData[trackId] = track
            tracks.trackIdByPropPath[pathEncoded] = trackId
          }

          export function setPrimitivePropAsStatic(
            p: WithoutSheetInstance<PropAddress> & {
              value: SerializablePrimitive
            },
          ) {
            const tracks = _ensureTracksOfObject(p)
            const encodedPropPath = encodePathToProp(p.pathToProp)
            const trackId = tracks.trackIdByPropPath[encodedPropPath]

            if (typeof trackId !== 'string') return

            delete tracks.trackIdByPropPath[encodedPropPath]
            delete tracks.trackData[trackId]

            stateEditors.coreByProject.historic.sheetsById.staticOverrides.byObject.setValueOfPrimitiveProp(
              p,
            )
          }

          export function setCompoundPropAsStatic(
            p: WithoutSheetInstance<PropAddress> & {
              value: SerializableMap
            },
          ) {
            const tracks = _ensureTracksOfObject(p)

            for (const encodedPropPath of Object.keys(
              tracks.trackIdByPropPath,
            )) {
              const propPath = JSON.parse(encodedPropPath)
              const isSubOfTargetPath = p.pathToProp.every(
                (key, i) => propPath[i] === key,
              )
              if (isSubOfTargetPath) {
                const trackId = tracks.trackIdByPropPath[encodedPropPath]
                if (typeof trackId !== 'string') continue
                delete tracks.trackIdByPropPath[encodedPropPath]
                delete tracks.trackData[trackId]
              }
            }

            stateEditors.coreByProject.historic.sheetsById.staticOverrides.byObject.setValueOfCompoundProp(
              p,
            )
          }

          function _getTrack(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
            },
          ) {
            return _ensureTracksOfObject(p).trackData[p.trackId]
          }

          function _getKeyframeById(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeId: KeyframeId
            },
          ): Keyframe | undefined {
            const track = _getTrack(p)
            if (!track) return
            return track.keyframes.find((kf) => kf.id === p.keyframeId)
          }

          /**
           * Sets a keyframe at the exact specified position.
           * Any position snapping should be done by the caller.
           */
          export function setKeyframeAtPosition<T extends SerializableValue>(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              position: number
              handles?: [number, number, number, number]
              value: T
              snappingFunction: SnappingFunction
              type?: KeyframeType
            },
          ) {
            const position = p.snappingFunction(p.position)
            const track = _getTrack(p)
            if (!track) return
            const {keyframes} = track
            const existingKeyframeIndex = keyframes.findIndex(
              (kf) => kf.position === position,
            )
            if (existingKeyframeIndex !== -1) {
              const kf = keyframes[existingKeyframeIndex]
              kf.value = p.value
              return
            }
            const indexOfLeftKeyframe = findLastIndex(
              keyframes,
              (kf) => kf.position < position,
            )
            if (indexOfLeftKeyframe === -1) {
              keyframes.unshift({
                // generating the keyframe within the `setKeyframeAtPosition` makes it impossible for us
                // to make this business logic deterministic, which is important to guarantee for collaborative
                // editing.
                id: generateKeyframeId(),
                position,
                connectedRight: true,
                handles: p.handles || [0.5, 1, 0.5, 0],
                type: p.type || 'bezier',
                value: p.value,
              })
              return
            }
            const leftKeyframe = keyframes[indexOfLeftKeyframe]
            keyframes.splice(indexOfLeftKeyframe + 1, 0, {
              id: generateKeyframeId(),
              position,
              connectedRight: leftKeyframe.connectedRight,
              handles: p.handles || [0.5, 1, 0.5, 0],
              type: p.type || 'bezier',
              value: p.value,
            })
          }

          export function unsetKeyframeAtPosition(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              position: number
            },
          ) {
            const track = _getTrack(p)
            if (!track) return
            const {keyframes} = track
            const index = keyframes.findIndex(
              (kf) => kf.position === p.position,
            )
            if (index === -1) return

            keyframes.splice(index, 1)
          }

          type SnappingFunction = (p: number) => number

          export function transformKeyframes(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeIds: KeyframeId[]
              translate: number
              scale: number
              origin: number
              snappingFunction: SnappingFunction
            },
          ) {
            const track = _getTrack(p)
            if (!track) return
            const initialKeyframes = current(track.keyframes)

            const selectedKeyframes = initialKeyframes.filter((kf) =>
              p.keyframeIds.includes(kf.id),
            )

            const transformed = selectedKeyframes.map((untransformedKf) => {
              const oldPosition = untransformedKf.position
              const newPosition = p.snappingFunction(
                transformNumber(oldPosition, p),
              )
              return {...untransformedKf, position: newPosition}
            })

            replaceKeyframes({...p, keyframes: transformed})
          }

          /**
           * Sets the easing between keyframes
           *
           * X = in keyframeIds
           * * = not in keyframeIds
           * + = modified handle
           * ```
           * X- --- -*- --- -X
           * X+ --- +*- --- -X+
           * ```
           *
           * TODO - explain further
           */
          export function setTweenBetweenKeyframes(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeIds: KeyframeId[]
              handles: [number, number, number, number]
            },
          ) {
            const track = _getTrack(p)
            if (!track) return

            track.keyframes = track.keyframes.map((kf, i) => {
              const prevKf = track.keyframes[i - 1]
              const isBeingEdited = p.keyframeIds.includes(kf.id)
              const isAfterEditedKeyframe = p.keyframeIds.includes(prevKf?.id)

              if (isBeingEdited && !isAfterEditedKeyframe) {
                return {
                  ...kf,
                  handles: [
                    kf.handles[0],
                    kf.handles[1],
                    p.handles[0],
                    p.handles[1],
                  ],
                }
              } else if (isBeingEdited && isAfterEditedKeyframe) {
                return {
                  ...kf,
                  handles: [
                    p.handles[2],
                    p.handles[3],
                    p.handles[0],
                    p.handles[1],
                  ],
                }
              } else if (isAfterEditedKeyframe) {
                return {
                  ...kf,
                  handles: [
                    p.handles[2],
                    p.handles[3],
                    kf.handles[2],
                    kf.handles[3],
                  ],
                }
              } else {
                return kf
              }
            })
          }

          export function setHandlesForKeyframe(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeId: KeyframeId
              start?: [number, number]
              end?: [number, number]
            },
          ) {
            const keyframe = _getKeyframeById(p)
            if (keyframe) {
              keyframe.handles = [
                p.end?.[0] ?? keyframe.handles[0],
                p.end?.[1] ?? keyframe.handles[1],
                p.start?.[0] ?? keyframe.handles[2],
                p.start?.[1] ?? keyframe.handles[3],
              ]
            }
          }

          export function deleteKeyframes(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeIds: KeyframeId[]
            },
          ) {
            const track = _getTrack(p)
            if (!track) return

            track.keyframes = track.keyframes.filter(
              (kf) => p.keyframeIds.indexOf(kf.id) === -1,
            )
          }

          export function setKeyframeType(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframeId: KeyframeId
              keyframeType: KeyframeType
            },
          ) {
            const kf = _getKeyframeById(p)
            if (kf) {
              kf.type = p.keyframeType
            }
          }

          // Future: consider whether a list of "partial" keyframes requiring `id` is possible to accept
          //  * Consider how common this pattern is, as this sort of concept would best be encountered
          //    a few times to start to see an opportunity for improved ergonomics / crdt.
          export function replaceKeyframes(
            p: WithoutSheetInstance<SheetObjectAddress> & {
              trackId: SequenceTrackId
              keyframes: Array<Keyframe>
              snappingFunction: SnappingFunction
            },
          ) {
            const track = _getTrack(p)
            if (!track) return
            const initialKeyframes = current(track.keyframes)
            const sanitizedKeyframes = p.keyframes
              .filter((kf) => {
                if (typeof kf.value === 'number' && !isFinite(kf.value))
                  return false
                if (!kf.handles.every((handleValue) => isFinite(handleValue)))
                  return false

                return true
              })
              .map((kf) => ({...kf, position: p.snappingFunction(kf.position)}))

            const newKeyframesById = keyBy(sanitizedKeyframes, 'id')

            const unselected = initialKeyframes.filter(
              (kf) => !newKeyframesById[kf.id],
            )

            const unselectedByPosition = keyBy(unselected, 'position')

            // If the new transformed keyframes overlap with any existing keyframes,
            // we remove the overlapped keyframes
            sanitizedKeyframes.forEach(({position}) => {
              const existingKeyframeAtThisPosition =
                unselectedByPosition[position]
              if (existingKeyframeAtThisPosition) {
                pullFromArray(unselected, existingKeyframeAtThisPosition)
              }
            })

            const sorted = sortBy(
              [...unselected, ...sanitizedKeyframes],
              'position',
            )

            track.keyframes = sorted
          }
        }

        export namespace staticOverrides {
          export namespace byObject {
            function _ensure(p: WithoutSheetInstance<SheetObjectAddress>) {
              const byObject =
                stateEditors.coreByProject.historic.sheetsById._ensure(p)
                  .staticOverrides.byObject
              byObject[p.objectKey] ??= {}
              return byObject[p.objectKey]!
            }

            export function setValueOfCompoundProp(
              p: WithoutSheetInstance<PropAddress> & {
                value: SerializableMap
              },
            ) {
              const existingOverrides = _ensure(p)
              set(existingOverrides, p.pathToProp, p.value)
            }

            export function setValueOfPrimitiveProp(
              p: WithoutSheetInstance<PropAddress> & {
                value: SerializablePrimitive
              },
            ) {
              const existingOverrides = _ensure(p)
              set(existingOverrides, p.pathToProp, p.value)
            }

            export function unsetValueOfPrimitiveProp(
              p: WithoutSheetInstance<PropAddress>,
            ) {
              const existingStaticOverrides =
                stateEditors.coreByProject.historic.sheetsById._ensure(p)
                  .staticOverrides.byObject[p.objectKey]

              if (!existingStaticOverrides) return

              removePathFromObject(existingStaticOverrides, p.pathToProp)
            }
          }
        }
      }
    }
  }
}

export type IStateEditors = typeof stateEditors
