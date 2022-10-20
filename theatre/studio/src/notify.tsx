import React, {Fragment} from 'react'
import toast, {useToaster} from 'react-hot-toast/headless'
import styled from 'styled-components'
import snarkdown from 'snarkdown'
import {pointerEventsAutoInNormalMode} from './css'
import type {
  Notification,
  NotificationType,
  Notify,
  Notifiers,
} from '@theatre/shared/notify'
import {useVal} from '@theatre/react'
import getStudio from './getStudio'

const hashNotification = ({title, message}: Notification) =>
  `${title} ${message}`

const uniquenessMap = (() => {
  const map = new Map<string, number>()
  return {
    add: (notification: Notification) => {
      const key = hashNotification(notification)
      if (map.has(key)) {
        map.set(key, map.get(key)! + 1)
      } else {
        map.set(key, 1)
      }
    },
    delete: (notification: Notification) => {
      const key = hashNotification(notification)
      if (map.has(key) && map.get(key)! > 1) {
        map.set(key, map.get(key)! - 1)
      } else {
        map.delete(key)
      }
    },
    check: (notification: Notification) =>
      map.has(hashNotification(notification)),
  }
})()

// massive hack, we should be able to attach this info to toasts
const typeMap = (() => {
  const map = new Map<NotificationType, number>()
  return {
    add: (type: NotificationType) => {
      if (map.has(type)) {
        map.set(type, map.get(type)! + 1)
      } else {
        map.set(type, 1)
      }
    },
    delete: (type: NotificationType) => {
      if (map.has(type) && map.get(type)! > 1) {
        map.set(type, map.get(type)! - 1)
      } else {
        map.delete(type)
      }
    },
    check: (type: NotificationType) => map.has(type),
    get types() {
      return Array.of(...map.keys())
    },
  }
})()

const NotificationContainer = styled.div`
  width: 100%;
  border-radius: 4px;
  display: flex;
  gap: 12px;
  ${pointerEventsAutoInNormalMode};
  background-color: rgba(40, 43, 47, 0.8);
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(14px);

  @supports not (backdrop-filter: blur()) {
    background: rgba(40, 43, 47, 0.95);
  }
`

const NotificationTitle = styled.div`
  font-size: 14px;
  font-weight: bold;
`

const NotificationMain = styled.div`
  flex: 1;
  flex-direction: column;
  width: 0;
  display: flex;
  padding: 16px 0;
  gap: 12px;
`

const NotificationMessage = styled.div`
  color: #b4b4b4;
  font-size: 12px;
  line-height: 1.4;

  a {
    color: rgba(255, 255, 255, 0.9);
  }

  hr {
    visibility: hidden;
    height: 8px;
  }

  em {
    font-style: italic;
  }

  strong {
    font-weight: bold;
    color: #d5d5d5;
  }

  .code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.3);
    padding: 4px;
    margin-bottom: 8px;
    margin-top: 8px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  :not(.code) > code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.3);
    padding: 1px 1px 2px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    white-space: pre-wrap;
  }
`

const DismissButton = styled.button`
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding-left: 12px;
  padding-right: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.05);

  &:hover {
    background: rgba(255, 255, 255, 0.05);
  }
`

const COLORS = {
  info: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
}

const IndicatorDot = styled.div<{type: NotificationType}>`
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 12px;

  ::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 999999px;
    background-color: ${({type}) => COLORS[type]};
  }
`

const replaceBrWithHr = (text: string) => {
  return text.replace(/<br \/>/g, '<hr />')
}

const massageMessage = (message: string) => {
  return replaceBrWithHr(snarkdown(message))
}

const createHandler =
  (type: 'warning' | 'success' | 'info'): Notify =>
  (title, message, docs = [], allowDuplicates = false) => {
    if (allowDuplicates || !uniquenessMap.check({title, message})) {
      uniquenessMap.add({title, message})
      typeMap.add(type)
      toast.custom(
        (t) => (
          <NotificationContainer>
            <IndicatorDot type={type} />
            <NotificationMain>
              <NotificationTitle>{title}</NotificationTitle>
              <NotificationMessage
                dangerouslySetInnerHTML={{
                  __html: massageMessage(message),
                }}
              />
              <NotificationMessage>
                {docs.length > 0 && (
                  <span>
                    Docs:{' '}
                    {docs.map((doc, i) => (
                      <Fragment key={i}>
                        {i > 0 && ', '}
                        <a target="_blank" href={doc.url}>
                          {doc.title}
                        </a>
                      </Fragment>
                    ))}
                  </span>
                )}
              </NotificationMessage>
            </NotificationMain>
            <DismissButton
              onClick={() => {
                toast.remove(t.id)
                uniquenessMap.delete({title, message})
                typeMap.delete(type)
              }}
            >
              Close
            </DismissButton>
          </NotificationContainer>
        ),
        {duration: Infinity},
      )
    }
  }

export const notify: Notifiers = {
  warning: createHandler('warning'),
  success: createHandler('success'),
  info: createHandler('info'),
}

const ButtonContainer = styled.div<{
  align: 'center' | 'side'
  danger?: boolean
}>`
  display: flex;
  justify-content: ${({align}) => (align === 'center' ? 'center' : 'flex-end')};

  button {
    position: relative;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 12px;
    ${pointerEventsAutoInNormalMode};
    background-color: rgba(40, 43, 47, 0.8);
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25), 0 2px 6px rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(14px);
    border: none;
    padding: 12px;
    color: #fff;
    overflow: hidden;

    ::before {
      content: '';
      position: absolute;
      inset: 0;
    }

    :hover::before {
      background: ${({danger}) =>
        danger ? 'rgba(255, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'};
    }

    @supports not (backdrop-filter: blur()) {
      background: rgba(40, 43, 47, 0.95);
    }
  }
`

const Dots = styled.span`
  display: flex;
  gap: 4px;
`

const NotificationsDot = styled.div<{type: NotificationType}>`
  width: 8px;
  height: 8px;
  border-radius: 999999px;
  background-color: ${({type}) => COLORS[type]};
`

const NotifierContainer = styled.div`
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  position: fixed;
  right: 8px;
  bottom: 8px;
  width: 500px;
  height: 50vh;
  min-height: 400px;
`

const NotificationScroller = styled.div`
  overflow: hidden;
  pointer-events: auto;
  border-radius: 4px;

  & > div {
    display: flex;
    flex-direction: column-reverse;
    gap: 8px;
    overflow: scroll;
    height: 100%;
  }
`

export const Notifier = () => {
  const {toasts, handlers} = useToaster()
  const {startPause, endPause} = handlers

  const pinNotifications =
    useVal(getStudio().atomP.ahistoric.pinNotifications) ?? true
  const togglePinNotifications = () =>
    getStudio().transaction(({stateEditors, drafts}) => {
      stateEditors.studio.ahistoric.setPinNotifications(
        !(drafts.ahistoric.pinNotifications ?? true),
      )
    })

  return (
    <NotifierContainer>
      <ButtonContainer align="side">
        {toasts.length > 0 && (
          <button onClick={() => togglePinNotifications()}>
            {!pinNotifications ? (
              <>
                <span>Notifications</span>
                <Dots>
                  {typeMap.types.map((type) => (
                    <NotificationsDot type={type} key={type} />
                  ))}
                </Dots>
              </>
            ) : (
              'Close'
            )}
          </button>
        )}
      </ButtonContainer>
      {!pinNotifications ? null : (
        <>
          <NotificationScroller
            onMouseEnter={startPause}
            onMouseLeave={endPause}
          >
            <div>
              {toasts.map((toast) => {
                return (
                  <div key={toast.id}>
                    {/* message is always a function in our case */}
                    {/* @ts-ignore */}
                    {toast.message(toast)}
                  </div>
                )
              })}
            </div>
          </NotificationScroller>
          {toasts.length > 0 && (
            <ButtonContainer align="side" danger={true}>
              <button onClick={() => toast.remove()}>Clear</button>
            </ButtonContainer>
          )}
        </>
      )}
    </NotifierContainer>
  )
}
