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
  return <button onClick={()=>ctx.setValue(value)} className={['dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0', active?'bg-gray-800 text-white':'bg-white'].join(' ')}>{children}</button>
}

export function TabsContent({value, children}:{value:string, children:React.ReactNode}){
  const ctx=useContext(TabsCtx)!
  if (ctx.value!==value) return null
  return <div>{children}</div>
}
