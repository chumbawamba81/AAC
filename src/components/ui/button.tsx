import React from 'react'
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline'|'secondary'|'destructive' }) {
  const base = 'inline-flex items-center justify-center h-8 rounded-md gap-1.5 px-3 py-2 text-sm font-medium transition active:scale-[.98] cursor-pointer'
  const variants: Record<string,string> = {
    default: 'bg-lime-800 text-white hover:bg-lime-600',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50',
    secondary: 'bg-cyan-800 text-white hover:bg-cyan-600',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  }
  const cls = [base, variants[props.variant||'default'], props.className].filter(Boolean).join(' ')
  const { variant, ...rest } = props
  return <button {...rest} className={cls} />
}
