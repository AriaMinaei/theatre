import {usePrism, useVal} from '@theatre/react'
import getStudio from '@theatre/studio/getStudio'
import React, {useMemo, useRef} from 'react'
import styled from 'styled-components'
import type {$IntentionalAny} from '@theatre/dataverse/dist/types'
import useTooltip from '@theatre/studio/uiComponents/Popover/useTooltip'
import ErrorTooltip from '@theatre/studio/uiComponents/Popover/ErrorTooltip'
import BasicTooltip from '@theatre/studio/uiComponents/Popover/BasicTooltip'
import {val} from '@theatre/dataverse'
import ExtensionToolbar from './ExtensionToolbar/ExtensionToolbar'
import PinButton from './PinButton'
import {Details, Ellipsis, Outline} from '@theatre/studio/uiComponents/icons'
import DoubleChevronLeft from '@theatre/studio/uiComponents/icons/DoubleChevronLeft'
import DoubleChevronRight from '@theatre/studio/uiComponents/icons/DoubleChevronRight'
import ToolbarIconButton from '@theatre/studio/uiComponents/toolbar/ToolbarIconButton'
import usePopover from '@theatre/studio/uiComponents/Popover/usePopover'
import MoreMenu from './MoreMenu/MoreMenu'

const Container = styled.div`
  height: 36px;
  pointer-events: none;

  display: flex;
  justify-content: space-between;
  padding: 12px;
`

const NumberOfConflictsIndicator = styled.div`
  color: white;
  width: 14px;
  height: 14px;
  background: #d00;
  border-radius: 4px;
  text-align: center;
  line-height: 14px;
  font-weight: 600;
  font-size: 8px;
  position: relative;
  left: -6px;
  top: -11px;
  margin-right: -14px;
  box-shadow: 0 4px 6px -4px #00000059;
`

const SubContainer = styled.div`
  display: flex;
  gap: 8px;
`

const HasUpdatesBadge = styled.div`
  position: absolute;
  background: #40aaa4;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  right: -2px;
  top: -2px;
`

const GroupDivider = styled.div`
  position: abolute;
  height: 32px;
  width: 1px;
  background: #373b40;
  opacity: 0.4;
`

let showedVisualTestingWarning = false

const GlobalToolbar: React.FC = () => {
  const conflicts = usePrism(() => {
    const ephemeralStateOfAllProjects = val(
      getStudio().atomP.ephemeral.coreByProject,
    )
    return Object.entries(ephemeralStateOfAllProjects)
      .map(([projectId, state]) => ({projectId, state}))
      .filter(
        ({state}) =>
          state.loadingState.type === 'browserStateIsNotBasedOnDiskState',
      )
  }, [])
  const [triggerTooltip, triggerButtonRef] = useTooltip(
    {enabled: conflicts.length > 0, enterDelay: conflicts.length > 0 ? 0 : 200},
    () =>
      conflicts.length > 0 ? (
        <ErrorTooltip>
          {conflicts.length === 1
            ? `There is a state conflict in project "${conflicts[0].projectId}". Select the project in the outline below in order to fix it.`
            : `There are ${conflicts.length} projects that have state conflicts. They are highlighted in the outline below. `}
        </ErrorTooltip>
      ) : (
        <BasicTooltip>Outline</BasicTooltip>
      ),
  )

  const outlinePinned = useVal(getStudio().atomP.ahistoric.pinOutline) ?? true
  const detailsPinned = useVal(getStudio().atomP.ahistoric.pinDetails) ?? true
  const hasUpdates =
    useVal(getStudio().atomP.ahistoric.updateChecker.result.hasUpdates) === true

  const [moreMenu, openMoreMenu] = usePopover(
    () => {
      const triggerBounds = moreMenuTriggerRef.current!.getBoundingClientRect()
      return {
        debugName: 'More Menu',

        constraints: {
          maxX: triggerBounds.right,
          maxY: 8,
          // MVP: Don't render the more menu all the way to the left
          // when it doesn't fit on the screen height
          // See https://linear.app/theatre/issue/P-178/bug-broken-updater-ui-in-simple-html-page
          // 1/10 There's a better way to solve this.
          // 1/10 Perhaps consider separate constraint like "rightSideMinX" & for future: "bottomSideMinY"
          // 2/10 Or, consider constraints being a function of the dimensions of the box => constraints.
          minX: triggerBounds.left - 140,
          minY: 8,
        },
        verticalGap: 2,
      }
    },
    () => {
      return <MoreMenu />
    },
  )
  const moreMenuTriggerRef = useRef<HTMLButtonElement>(null)

  const showUpdatesBadge = useMemo(() => {
    if (hasUpdates || window.__IS_VISUAL_REGRESSION_TESTING) {
      if (!showedVisualTestingWarning) {
        showedVisualTestingWarning = true
        console.warn(
          "Visual regression testing enabled, so we're showing the updates badge unconditionally",
        )
      }
      return true
    }

    return hasUpdates
  }, [hasUpdates])

  return (
    <Container>
      <SubContainer>
        {triggerTooltip}
        <PinButton
          ref={triggerButtonRef as $IntentionalAny}
          data-testid="OutlinePanel-TriggerButton"
          onClick={() => {
            getStudio().transaction(({stateEditors, drafts}) => {
              stateEditors.studio.ahistoric.setPinOutline(
                !(drafts.ahistoric.pinOutline ?? true),
              )
            })
          }}
          icon={<Outline />}
          pinHintIcon={<DoubleChevronRight />}
          unpinHintIcon={<DoubleChevronLeft />}
          pinned={outlinePinned}
        />
        {conflicts.length > 0 ? (
          <NumberOfConflictsIndicator>
            {conflicts.length}
          </NumberOfConflictsIndicator>
        ) : null}
        <ExtensionToolbar showLeftDivider toolbarId="global" />
      </SubContainer>
      <SubContainer>
        {moreMenu}
        <ToolbarIconButton
          ref={moreMenuTriggerRef}
          onClick={(e) => {
            openMoreMenu(e, moreMenuTriggerRef.current!)
          }}
        >
          <Ellipsis />
          {showUpdatesBadge && <HasUpdatesBadge />}
        </ToolbarIconButton>
        <PinButton
          ref={triggerButtonRef as $IntentionalAny}
          onClick={() => {
            getStudio().transaction(({stateEditors, drafts}) => {
              stateEditors.studio.ahistoric.setPinDetails(
                !(drafts.ahistoric.pinDetails ?? true),
              )
            })
          }}
          icon={<Details />}
          pinHintIcon={<DoubleChevronLeft />}
          unpinHintIcon={<DoubleChevronRight />}
          pinned={detailsPinned}
        />
      </SubContainer>
    </Container>
  )
}

export default GlobalToolbar
