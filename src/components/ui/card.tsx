import React from 'react'
export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['bg-neutral-50 text-card-foreground flex flex-col gap-6 rounded-sm border py-6 pb-0 lg:hidden xl:flex', props.className].join(' ')} />
}

export function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6', props.className].join(' ')} />
  
}
export function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 {...props} className={['font-semibold text-2xl', props.className].join(' ')} />
}
export function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={['p-4', props.className].join(' ')} />
}
