import React, { createContext, useContext } from 'react'
type Ctx = { value:string, onChange:(v:string)=>void }
const SelectCtx = createContext<Ctx|null>(null)
export function Select({value, onValueChange, children}:{value:string, onValueChange:(v:string)=>void, children:React.ReactNode}){
  return <SelectCtx.Provider value={{value, onChange:onValueChange}}>{children}</SelectCtx.Provider>
}
export function SelectTrigger({children}:{children:React.ReactNode}){ return <div className="relative">{children}</div> }
export function SelectValue(){ const ctx=useContext(SelectCtx)!; return <select className="w-full rounded-xl border px-3 py-2 text-sm" value={ctx.value} onChange={e=>ctx.onChange(e.target.value)}>{/* options come from content */}</select> }
export function SelectContent({children}:{children:React.ReactNode}){ return <>{children}</> }
export function SelectItem({value, children}:{value:string, children:React.ReactNode}){ return <option value={value}>{children}</option> }
