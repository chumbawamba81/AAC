import React from 'react'
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={['w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-200', props.className].join(' ')} />
}
