import React from 'react'
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline'|'secondary'|'destructive'|'stone'|'dark'|'success'|'grey'|'warning'|'default_left_group'|'destructive_right_group' }) {
  const base = 'inline-flex items-center justify-center h-8 gap-1.5 px-3 py-2 text-sm font-medium transition active:scale-[.98] cursor-pointer'
  const variants: Record<string,string> = {
    default: 'rounded-md bg-sky-600 text-white hover:bg-sky-800',
    outline: 'rounded-md border border-gray-300 bg-white hover:bg-gray-50',
    warning: 'rounded-md bg-yellow-600 text-white hover:bg-yellow-800',
    secondary: 'rounded-md bg-lime-600 text-white hover:bg-lime-800',
    destructive: 'rounded-md bg-red-600 text-white hover:bg-red-700',
    stone:'rounded-md bg-stone-600 text-white hover:bg-stone-800',
    dark: 'rounded-md text-white bg-gray-800 hover:bg-gray-900',
    success: 'rounded-md bg-green-600 text-white hover:bg-green-800',
    grey: 'rounded-md bg-gray-500 text-white hover:bg-gray-600 focus:outline-hidden focus:bg-gray-600 disabled:opacity-50',
    default_left_group: 'rounded-s-lg bg-sky-600 text-white hover:bg-sky-800',
    destructive_right_group: 'rounded-e-lg bg-red-600 text-white hover:bg-red-700',
  }
  const cls = [base, variants[props.variant||'default'], props.className].filter(Boolean).join(' ')
  const { variant, ...rest } = props
  return <button {...rest} className={cls} />
}
