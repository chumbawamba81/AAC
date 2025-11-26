import React from 'react'
export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['relative flex flex-col my-6 bg-white border border-slate-200 rounded-lg', props.className].join(' ')} />
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['mb-0 border-b bg-amber-500 text-white p-2 px-1', props.className].join(' ')} />
  
}
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <span {...props} className={['px-4 text-xs xs:text-sm sm:text-base md:text-lg font-medium uppercase', props.className].join(' ')} />
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['', props.className].join(' ')} />
}
