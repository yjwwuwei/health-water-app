import { useLayoutEffect, useId, useRef, type ReactNode } from 'react'
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const d = ref.current!
    const trigger = document.activeElement as HTMLElement | null
    d.showModal()
    d.querySelector<HTMLElement>('input, select, textarea')?.focus()
    return () => {
      d.close()
      queueMicrotask(() => {
        if (trigger?.isConnected) trigger.focus()
      })
    }
  }, [])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section className="modal-content">
        <header className="section-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="关闭对话框">
            ×
          </button>
        </header>
        {children}
      </section>
    </dialog>
  )
}
