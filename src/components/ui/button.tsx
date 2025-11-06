import React from 'react'
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline'|'secondary'|'destructive'|'stone'|'dark'|'success'|'grey'|'warning' }) {
  const base = 'inline-flex items-center justify-center h-8 rounded-md gap-1.5 px-3 py-2 text-sm font-medium transition active:scale-[.98] cursor-pointer'
  const variants: Record<string,string> = {
    default: 'bg-sky-600 text-white hover:bg-sky-800',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50',
    warning: 'bg-yellow-600 text-white hover:bg-yellow-800',
    secondary: 'bg-lime-600 text-white hover:bg-lime-800',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    stone:'bg-stone-600 text-white hover:bg-stone-800',
    dark: 'text-white bg-gray-800 hover:bg-gray-900',
    success: 'bg-green-600 text-white hover:bg-green-800',
    grey: 'bg-gray-500 text-white hover:bg-gray-600 focus:outline-hidden focus:bg-gray-600 disabled:opacity-50'
  }
  const cls = [base, variants[props.variant||'default'], props.className].filter(Boolean).join(' ')
  const { variant, ...rest } = props
  return <button {...rest} className={cls} />
}
