import React from 'react'
export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['rounded-2xl border bg-white shadow-sm', props.className].join(' ')} />
}
export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['p-4 border-b', props.className].join(' ')} />
}
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} className={['text-lg font-semibold', props.className].join(' ')} />
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['p-4', props.className].join(' ')} />
}
