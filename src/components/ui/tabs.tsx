import React, { createContext, useContext, useState } from 'react'
const TabsCtx = createContext<{value:string,setValue:(v:string)=>void}|null>(null)
export function Tabs({defaultValue, children}:{defaultValue:string, children:React.ReactNode}){
  const [value,setValue]=useState(defaultValue)
  return <TabsCtx.Provider value={{value,setValue}}>{children}</TabsCtx.Provider>
}
export function TabsList({children}:{children:React.ReactNode}){ return <div className="mb-3 flex gap-2">{children}</div> }
export function TabsTrigger({value, children}:{value:string, children:React.ReactNode}){
  const ctx=useContext(TabsCtx)!
  const active = ctx.value===value
  return <button onClick={()=>ctx.setValue(value)} className={['rounded-xl border px-3 py-1.5 text-sm', active?'bg-blue-600 text-white border-blue-600':'bg-white'].join(' ')}>{children}</button>
}
export function TabsContent({value, children}:{value:string, children:React.ReactNode}){
  const ctx=useContext(TabsCtx)!
  if (ctx.value!==value) return null
  return <div>{children}</div>
}
