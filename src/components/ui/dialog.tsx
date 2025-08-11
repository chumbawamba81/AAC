import React from 'react'
export function Dialog(props:{open:boolean, onOpenChange:(v:boolean)=>void, children:React.ReactNode}){
  return <>{props.open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={()=>props.onOpenChange(false)}>
    <div className="mx-4 max-w-3xl w-full" onClick={e=>e.stopPropagation()}>{props.children}</div>
  </div>}</>
}
export function DialogContent(props:React.HTMLAttributes<HTMLDivElement>){ return <div {...props} className={['rounded-2xl bg-white p-4 shadow-xl', props.className].join(' ')} /> }
export function DialogHeader(props:React.HTMLAttributes<HTMLDivElement>){ return <div {...props} className={['mb-2', props.className].join(' ')} /> }
export function DialogTitle(props:React.HTMLAttributes<HTMLHeadingElement>){ return <h3 {...props} className={['text-lg font-semibold', props.className].join(' ')} /> }
