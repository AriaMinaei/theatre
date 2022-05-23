import {getOutlineSelection} from '@theatre/studio/selectors'
import {usePrism, useVal} from '@theatre/react'
import React, {useEffect, useState} from 'react'
import styled from 'styled-components'
import {isProject, isSheetObject} from '@theatre/shared/instanceTypes'
import {
  panelZIndexes,
  TitleBar_Piece,
  TitleBar_Punctuation,
} from '@theatre/studio/panels/BasePanel/common'
import {pointerEventsAutoInNormalMode} from '@theatre/studio/css'
import ObjectDetails from './ObjectDetails'
import ProjectDetails from './ProjectDetails'
import getStudio from '@theatre/studio/getStudio'

const Container = styled.div<{pin: boolean}>`
  background-color: rgba(40, 43, 47, 0.8);
  pointer-events: none;
  position: fixed;
  right: 8px;
  top: 50px;
  bottom: 0px;
  width: 236px;
  height: fit-content;
  z-index: ${panelZIndexes.propsPanel};

  box-shadow: 0px 1px 1px rgba(0, 0, 0, 0.25), 0px 2px 6px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(14px);
  border-radius: 2px;

  display: ${({pin}) => (pin ? 'block' : 'none')};
`

const Title = styled.div`
  margin: 0 10px;
  color: #919191;
  font-weight: 500;
  font-size: 10px;
  user-select: none;
  ${pointerEventsAutoInNormalMode};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const headerHeight = `32px`

const Header = styled.div`
  height: ${headerHeight};
  display: flex;
  align-items: center;
`

const Body = styled.div`
  ${pointerEventsAutoInNormalMode};
  height: auto;
  max-height: calc(100% - ${headerHeight});
  overflow-y: scroll;
  &::-webkit-scrollbar {
    display: none;
  }

  scrollbar-width: none;
  padding: 0;
  user-select: none;
`

const DetailPanel: React.FC<{}> = (props) => {
  const pin = useVal(getStudio().atomP.ahistoric.pinDetails)

  const [hovering, setHovering] = useState(false)

  useEffect(() => {
    const listener = (e: MouseEvent) => {
      const threshold = hovering ? 200 : 50
      if (e.x > window.innerWidth - threshold) {
        setHovering(true)
      } else {
        setHovering(false)
      }
    }
    document.addEventListener('mousemove', listener)

    return () => document.removeEventListener('mousemove', listener)
  }, [hovering])

  console.log(hovering)

  return usePrism(() => {
    const selection = getOutlineSelection()

    const obj = selection.find(isSheetObject)
    if (obj) {
      return (
        <Container pin={pin || hovering}>
          <Header>
            <Title
              title={`${obj.sheet.address.sheetId}: ${obj.sheet.address.sheetInstanceId} > ${obj.address.objectKey}`}
            >
              <TitleBar_Piece>{obj.sheet.address.sheetId} </TitleBar_Piece>

              <TitleBar_Punctuation>{':'}&nbsp;</TitleBar_Punctuation>
              <TitleBar_Piece>
                {obj.sheet.address.sheetInstanceId}{' '}
              </TitleBar_Piece>

              <TitleBar_Punctuation>&nbsp;&rarr;&nbsp;</TitleBar_Punctuation>
              <TitleBar_Piece>{obj.address.objectKey}</TitleBar_Piece>
            </Title>
          </Header>
          <Body>
            <ObjectDetails objects={[obj]} />
          </Body>
        </Container>
      )
    }
    const project = selection.find(isProject)
    if (project) {
      return (
        <Container pin={pin || hovering}>
          <Header>
            <Title title={`${project.address.projectId}`}>
              <TitleBar_Piece>{project.address.projectId} </TitleBar_Piece>
            </Title>
          </Header>
          <Body>
            <ProjectDetails projects={[project]} />
          </Body>
        </Container>
      )
    }

    return <></>
  }, [pin, hovering])
}

export default DetailPanel
