import {
  Activity,
  Bike,
  Bluetooth,
  Hammer,
  History,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  Mountain,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: '/' | '/ride' | '/workouts' | '/builder' | '/routes' | '/history' | '/fitness' | '/coach' | '/devices' | '/settings'
  label: string
  icon: LucideIcon
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/ride', label: 'Ride', icon: Bike },
  { to: '/workouts', label: 'Workouts', icon: ListChecks },
  { to: '/builder', label: 'Builder', icon: Hammer },
  { to: '/routes', label: 'Routes', icon: Mountain },
  { to: '/history', label: 'History', icon: History },
  { to: '/fitness', label: 'Fitness', icon: Activity },
  { to: '/coach', label: 'Coach', icon: MessageSquare },
  { to: '/devices', label: 'Devices', icon: Bluetooth },
  { to: '/settings', label: 'Settings', icon: Settings },
]
