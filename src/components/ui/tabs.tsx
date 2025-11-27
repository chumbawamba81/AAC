import React, { createContext, useContext, useState } from 'react'
const TabsCtx = createContext<{value:string,setValue:(v:string)=>void}|null>(null)
export function Tabs({defaultValue, children}:{defaultValue:string, children:React.ReactNode}){
  const [value,setValue]=useState(defaultValue)
  return <TabsCtx.Provider value={{value,setValue}}>{children}</TabsCtx.Provider>
}
export function TabsList({children}:{children:React.ReactNode}){ return <div className="border-border/50 flex items-center gap-2 border-b px-3 py-1">{children}</div> }
export function TabsTrigger({value, children}:{value:string, children:React.ReactNode}){
  const ctx=useContext(TabsCtx)!
  const active = ctx.value===value
  return <button onClick={()=>ctx.setValue(value)} className={['text-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap cursor-pointer', active?'bg-gray-800 text-white':'bg-white hover:bg-neutral-200'].join(' ')}>{children}</button>
}

export function TabsContent({value, children}:{value:string, children:React.ReactNode}){
  const ctx=useContext(TabsCtx)!
  if (ctx.value!==value) return null
  return <div>{children}</div>
}
