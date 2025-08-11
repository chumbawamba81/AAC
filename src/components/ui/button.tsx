import React from 'react'
export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'outline'|'secondary'|'destructive' }) {
  const base = 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium shadow-sm transition active:scale-[.98]'
  const variants: Record<string,string> = {
    default: 'bg-blue-600 text-white hover:bg-blue-700',
    outline: 'border border-gray-300 bg-white hover:bg-gray-50',
    secondary: 'bg-gray-100 hover:bg-gray-200',
    destructive: 'bg-red-600 text-white hover:bg-red-700',
  }
  const cls = [base, variants[props.variant||'default'], props.className].filter(Boolean).join(' ')
  const { variant, ...rest } = props
  return <button {...rest} className={cls} />
}
