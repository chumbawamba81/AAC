import React from 'react'
export function Badge({variant='default', className='', ...rest}:{variant?:'default'|'secondary'|'destructive'} & React.HTMLAttributes<HTMLSpanElement>) {
  const styles: Record<string,string>={
    default:'bg-blue-100 text-blue-800',
    secondary:'bg-gray-100 text-gray-800',
    destructive:'bg-red-100 text-red-800'
  }
  return <span {...rest} className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', styles[variant], className].join(' ')} />
}
