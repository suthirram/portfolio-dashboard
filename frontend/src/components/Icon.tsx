import type { ReactNode, SVGProps } from 'react'

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number
  children?: ReactNode
}

function Svg({ size = 16, children, className, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `app-icon ${className}` : 'app-icon'}
      {...rest}
    >
      {children}
    </svg>
  )
}

export const ChartLineIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 19h16" />
    <path className="icon-market-up icon-motion" d="M6 16V9" />
    <path className="icon-market-down icon-motion" d="M10 16V5" />
    <path className="icon-market-warn icon-motion" d="M14 16v-6" />
    <path className="icon-market-up icon-motion" d="M18 16V7" />
    <path className="icon-market-up icon-trace" pathLength={18} d="M5 14l4-4 4 2 6-7" />
  </Svg>
)

export const CoinsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-gold icon-motion" d="M5 16h8l2 4H3l2-4z" />
    <path className="icon-gold-soft icon-motion" d="M11 10h8l2 4H9l2-4z" />
    <path className="icon-gold-soft" d="M8 4h8l2 4H6l2-4z" />
    <path className="icon-gold icon-spark" d="M18.5 3.5v2" />
    <path className="icon-gold icon-spark" d="M17.5 4.5h2" />
  </Svg>
)

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M5 4h14v16H5z" />
    <path className="icon-market-up icon-trace" pathLength={18} d="M8 8h8" />
    <path d="M8 12h8" />
    <path d="M8 16h5" />
    <path className="icon-success icon-motion" d="M16 16l2 2 3-5" />
  </Svg>
)

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path className="icon-admin icon-trace" pathLength={18} d="M9 12l2 2 4-5" />
    <path className="icon-admin icon-motion" d="M12 6v2" />
  </Svg>
)

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="8" cy="8" r="3" />
    <circle className="icon-admin icon-motion" cx="17" cy="9" r="2.5" />
    <path className="icon-muted" d="M3 20a5 5 0 0 1 10 0" />
    <path className="icon-muted" d="M13 20a4 4 0 0 1 8 0" />
    <path className="icon-user-tone icon-trace" pathLength={18} d="M10.5 8.5l4 1" />
  </Svg>
)

export const UserIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="12" cy="8" r="4" />
    <path className="icon-muted" d="M4 21a8 8 0 0 1 16 0" />
    <circle className="icon-user-tone icon-spark" cx="17.5" cy="5.5" r="1.5" />
  </Svg>
)

export const UserCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle className="icon-user-tone icon-motion" cx="9" cy="8" r="3.5" />
    <path className="icon-muted" d="M3 21a6 6 0 0 1 12 0" />
    <path className="icon-success icon-trace" pathLength={18} d="M16 12l2 2 4-5" />
  </Svg>
)

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M12 22s7-7.58 7-13a7 7 0 0 0-14 0c0 5.42 7 13 7 13z" />
    <circle className="icon-user-tone icon-motion" cx="12" cy="9" r="2.5" />
    <path className="icon-user-tone icon-spark" d="M12 4v2" />
  </Svg>
)

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-spin icon-accent" d="M20 12a8 8 0 1 1-2.34-5.66" />
    <path className="icon-spin" d="M20 4v6h-6" />
    <path className="icon-success icon-spark" d="M12 8v4l3 2" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect className="icon-spark " x="4" y="4" width="16" height="16" rx="5" />
    <path className="icon-spark icon-motion" d="M12 8v8M8 12h8" />
  </Svg>
)

export const EditIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 20h16" />
    <path className="icon-user-tone icon-motion" d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5z" />
    <path d="M13.5 6.5l4 4" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-danger icon-motion" d="M3 6h18" />
    <path className="icon-muted" d="M8 6V4h8v2" />
    <path className="icon-muted" d="M18 6l-1 14H7L6 6" />
    <path className="icon-danger" d="M10 11v5M14 11v5" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-success icon-trace" pathLength={18} d="M20 6L9 17l-5-5" />
  </Svg>
)

export const AlertTriangleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path className="icon-warning icon-motion" d="M12 9v4" />
    <circle className="icon-warning icon-spark" cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
  </Svg>
)

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path className="icon-danger icon-motion" d="M16 17l5-5-5-5" />
    <path className="icon-danger icon-motion" d="M21 12H9" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M4 7h16" />
    <path className="icon-muted" d="M4 17h16" />
    <path className="icon-user-tone icon-motion" d="M9 4v6" />
    <path className="icon-admin icon-motion" d="M15 14v6" />
    <circle className="icon-user-tone" cx="9" cy="7" r="2" />
    <circle className="icon-admin" cx="15" cy="17" r="2" />
  </Svg>
)

export const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path className="icon-muted" d="M20 12H5" />
    <path className="icon-user-tone icon-motion" d="M12 19l-7-7 7-7" />
  </Svg>
)
