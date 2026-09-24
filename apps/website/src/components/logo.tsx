export function Logo() {
  return (
    <svg
      xmlns='http://www.w3.org/2000/svg'
      width={64}
      height={64}
      viewBox='0 0 128 128'
    >
      <rect x='4' y='4' width='120' height='120' rx='30' fill='#0d1117' />
      <g fill='none' strokeLinecap='round' strokeWidth='12'>
        <path d='M48 26 L48 80 Q48 98 66 98' stroke='#e6edf3' />
        <path d='M28 50 L68 50' stroke='#e6edf3' />
        <path d='M82 30 L96 48' stroke='#7ee787' />
      </g>
    </svg>
  )
}
