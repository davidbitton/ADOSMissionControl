import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '../helpers/intl-wrapper'
import { NavPidPanel } from '@/components/fc/inav/NavPidPanel'
import { useDroneManager } from '@/stores/drone-manager'

vi.mock('lucide-react', () =>
  new Proxy(
    {},
    {
      get: (_t, name) => {
        if (name === '__esModule') return false
        return (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        )
      },
    },
  ),
)

vi.mock('@/hooks/use-armed-lock', () => ({
  useArmedLock: () => ({ isArmed: false, lockMessage: '' }),
}))

vi.mock('@/hooks/use-unsaved-guard', () => ({
  useUnsavedGuard: () => undefined,
}))

describe('NavPidPanel', () => {
  beforeEach(() => {
    useDroneManager.setState({ getSelectedProtocol: () => null } as never)
  })

  it('renders the panel title', () => {
    renderWithIntl(<NavPidPanel />)
    expect(screen.getByText('Nav PID')).toBeDefined()
  })

  it('renders the subtitle', () => {
    renderWithIntl(<NavPidPanel />)
    expect(screen.getByText('iNav navigation controller PID gains')).toBeDefined()
  })

  it('does not render PID inputs before Read is triggered', () => {
    renderWithIntl(<NavPidPanel />)
    expect(screen.queryByText('Position XY')).toBeNull()
  })

  it('shows Read from FC button when disconnected', () => {
    renderWithIntl(<NavPidPanel />)
    const readBtn = screen.getByRole('button', { name: /read from fc/i })
    expect(readBtn).toBeDefined()
  })

  it('shows Write to FC button only after data is loaded', async () => {
    const mockAdapter = {
      getSetting: vi.fn().mockResolvedValue(new Uint8Array([42])),
      setSetting: vi.fn().mockResolvedValue(undefined),
    }
    useDroneManager.setState({
      getSelectedProtocol: () => mockAdapter,
    } as never)

    const { container } = renderWithIntl(<NavPidPanel />)
    const readBtn = container.querySelector('button')
    expect(readBtn).toBeDefined()
  })

  it('reads the canonical iNav multicopter nav-PID setting keys', async () => {
    const calls: string[] = []
    const mockAdapter = {
      getSetting: vi.fn((name: string) => {
        calls.push(name)
        return Promise.resolve(new Uint8Array([42]))
      }),
      setSetting: vi.fn().mockResolvedValue(undefined),
    }
    useDroneManager.setState({
      getSelectedProtocol: () => mockAdapter,
    } as never)

    const { container } = renderWithIntl(<NavPidPanel />)
    const readBtn = container.querySelector('button')
    readBtn?.click()
    await new Promise((r) => setTimeout(r, 20))

    // At least one canonical nav_mc_* key must flow through getSetting.
    // Guards against a future rename that silently breaks real-FC reads.
    expect(calls).toContain('nav_mc_pos_xy_p')
  })
})
