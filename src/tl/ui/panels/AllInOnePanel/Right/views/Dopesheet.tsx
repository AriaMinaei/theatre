import React from 'react'

import withUtils, {
  IWithUtilsProps,
} from '$tl/ui/panels/AllInOnePanel/Right/views/withUtils'
import ViewBase, {
  IViewBaseProps,
} from '$tl/ui/panels/AllInOnePanel/Right/views/ViewBase'
import DopesheetPoint from '$tl/ui/panels/AllInOnePanel/Right/views/dopesheet/DopesheetPoint'
import {
  IColorAccent,
  INormalizedPoints,
} from '$tl/ui/panels/AllInOnePanel/Right/types'
import {
  IMoveDopesheetConnector,
  IMoveDopesheetConnectorTemp,
  IGetAllPoints,
  ITempPointRenderer,
} from '$tl/ui/panels/AllInOnePanel/Right/views/types'
import TempPointInSelection from '$tl/ui/panels/AllInOnePanel/Right/views/dopesheet/TempPointInSelection'
import {FRAME_DURATION} from '$tl/ui/panels/AllInOnePanel/TimeUI/utils'

interface IProps extends IViewBaseProps {
  colorAccent: IColorAccent
  points: INormalizedPoints
}

class Dopesheet extends ViewBase<IProps & IWithUtilsProps> {
  render() {
    const {colorAccent, points, propGetter} = this.props
    return (
      <>
        {this._renderTempPointsInSelection(
          this._getAllPoints,
          this._tempPointRenderer,
        )}
        <g fill={colorAccent.normal} stroke={colorAccent.normal}>
          {points.map((point, index) => {
            const prevPoint = points[index - 1]
            const nextPoint = points[index + 1]
            const nextNextPoint = points[index + 2]
            return (
              <DopesheetPoint
                key={index}
                colorAccent={colorAccent}
                pointIndex={index}
                originalTime={point.originalTime}
                originalValue={point.originalValue}
                pointTime={point.time}
                pointConnected={point.interpolationDescriptor.connected}
                removePoint={this._removePoint}
                addConnector={this._addConnector}
                removeConnector={this._removeConnector}
                movePointToNewCoords={this._movePointToNewCoords}
                movePointToNewCoordsTemp={this._movePointToNewCoordsTemp}
                moveConnector={this.moveConnector}
                moveConnectorTemp={this.moveConnectorTemp}
                propGetter={propGetter}
                addPointToSelection={this._addPointToSelection}
                removePointFromSelection={this._removePointFromSelection}
                showPointValuesEditor={this._showPointValuesEditor}
                showPointContextMenu={this._showPointContextMenu}
                showConnectorContextMenu={this._showConnectorContextMenu}
                {...(prevPoint != null
                  ? {
                      prevPointTime: prevPoint.time,
                      prevPointConnected:
                        prevPoint.interpolationDescriptor.connected,
                    }
                  : {})}
                {...(nextPoint != null
                  ? {
                      nextPointTime: nextPoint.time,
                      nextPointOriginalTime: nextPoint.originalTime,
                      nextPointConnected:
                        nextPoint.interpolationDescriptor.connected,
                    }
                  : {})}
                {...(nextNextPoint != null
                  ? {
                      nextNextPointTime: nextNextPoint.time,
                    }
                  : {})}
              />
            )
          })}
        </g>
      </>
    )
  }

  _getAllPoints: IGetAllPoints = () => {
    return this.props.points
  }

  _tempPointRenderer: ITempPointRenderer = (point, nextPoint) => {
    return (
      <TempPointInSelection
        colorAccent={this.props.colorAccent}
        point={point}
        nextPoint={nextPoint}
      />
    )
  }

  moveConnector: IMoveDopesheetConnector = pointIndex => {
    this.props.extremumsAPI.unpersist()
    const {propGetter, points} = this.props
    const point = points[pointIndex]
    const nextPoint = points[pointIndex + 1]

    this.project.reduxStore.dispatch(
      this.project._actions.batched([
        this.tempActionGroup.discard(),
        this.project._actions.historic.reAssignTimesOfTwoNeighbouringPoints({
          propAddress: propGetter('itemAddress'),
          leftPoint: {
            index: pointIndex,
            newTime: point.originalTime,
          },
          rightPoint: {
            index: pointIndex + 1,
            newTime: nextPoint.originalTime,
          },
          snapToFrameSize: FRAME_DURATION,
        }),
      ]),
    )
  }

  moveConnectorTemp: IMoveDopesheetConnectorTemp = (
    pointIndex,
    originalTimes,
    dxAsPercentageOfScrollableSpaceWidth,
  ) => {
    this.props.extremumsAPI.persist()
    const timelineDuration = this.props.propGetter('duration')

    const leftTime =
      originalTimes[0] +
      (dxAsPercentageOfScrollableSpaceWidth * timelineDuration) / 100

    const rightTime =
      originalTimes[1] +
      (dxAsPercentageOfScrollableSpaceWidth * timelineDuration) / 100

    this.project.reduxStore.dispatch(
      this.tempActionGroup.push(
        this.project._actions.historic.reAssignTimesOfTwoNeighbouringPoints({
          propAddress: this.props.propGetter('itemAddress'),
          leftPoint: {
            index: pointIndex,
            newTime: leftTime,
          },
          rightPoint: {
            index: pointIndex + 1,
            newTime: rightTime,
          },
          snapToFrameSize: FRAME_DURATION,
        }),
      ),
    )
  }
}

export default withUtils(Dopesheet)
