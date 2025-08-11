import React from 'react'
export function Label(props: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...props} className={['text-sm font-medium', props.className].join(' ')} />
}
