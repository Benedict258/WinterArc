import * as React from 'react'

export interface ToastProps {
  id?: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: 'default' | 'destructive'
  /** ms before auto-dismiss; paused while hovered or being swiped */
  duration?: number
}

type Action =
  | { type: 'ADD_TOAST'; toast: ToastProps }
  | { type: 'DISMISS_TOAST'; toastId?: string }

interface State {
  toasts: ToastProps[]
}

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  switch (action.type) {
    case 'ADD_TOAST':
      memoryState = {
        ...memoryState,
        toasts: [action.toast, ...memoryState.toasts].slice(0, 4),
      }
      break
    case 'DISMISS_TOAST':
      memoryState = {
        ...memoryState,
        toasts: action.toastId
          ? memoryState.toasts.filter((t) => t.id !== action.toastId)
          : [],
      }
      break
  }
  listeners.forEach((listener) => listener(memoryState))
}

export function toast(props: ToastProps) {
  const id = props.id || Math.random().toString(36).substring(2, 9)
  dispatch({
    type: 'ADD_TOAST',
    toast: { duration: props.variant === 'destructive' ? 6000 : 4000, ...props, id },
  })
  return {
    id,
    dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }),
  }
}

export function dismissToast(toastId?: string) {
  dispatch({ type: 'DISMISS_TOAST', toastId })
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: dismissToast,
  }
}
