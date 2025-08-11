import React from 'react'
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={['w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 ring-blue-200 min-h-[100px]', props.className].join(' ')} />
}
