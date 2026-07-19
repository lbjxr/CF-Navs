import { describe, expect, it } from 'vitest'
import {
  canSeeHomeView,
  createHomeGateState,
  getHomeGateView,
  shouldOpenLoginGate,
  shouldRevealHomeFromLocalSnapshot,
} from '../../src/lib/appNavigation'

describe('app navigation helpers', () => {
  it('allows the home view for public mode or authenticated sessions', () => {
    expect(canSeeHomeView({ publicMode: true, authenticated: false })).toBe(true)
    expect(canSeeHomeView({ publicMode: false, authenticated: true })).toBe(true)
  })

  it('blocks the home view for private mode when logged out', () => {
    expect(canSeeHomeView({ publicMode: false, authenticated: false })).toBe(false)
  })

  it('keeps unknown public mode out of the visible home gate', () => {
    expect(canSeeHomeView({ publicMode: undefined, authenticated: false })).toBe(false)
  })

  it('routes private logged-out sessions to login and all other boot states to home', () => {
    expect(getHomeGateView({ publicMode: false, authenticated: false })).toBe('login')
    expect(getHomeGateView({ publicMode: false, authenticated: true })).toBe('home')
    expect(getHomeGateView({ publicMode: true, authenticated: false })).toBe('home')
    expect(getHomeGateView({ publicMode: undefined, authenticated: false })).toBe('home')
  })

  it('builds the home gate state with the login modal flag', () => {
    expect(createHomeGateState({ publicMode: false, authenticated: false })).toEqual({
      view: 'login',
      loginModalOpen: true,
    })

    expect(createHomeGateState({ publicMode: true, authenticated: false })).toEqual({
      view: 'home',
      loginModalOpen: false,
    })
  })

  it('opens the login gate only after boot when home becomes inaccessible', () => {
    expect(shouldOpenLoginGate({ booting: false, currentView: 'home', canSeeHome: false })).toBe(true)
    expect(shouldOpenLoginGate({ booting: true, currentView: 'home', canSeeHome: false })).toBe(false)
    expect(shouldOpenLoginGate({ booting: false, currentView: 'admin', canSeeHome: false })).toBe(false)
    expect(shouldOpenLoginGate({ booting: false, currentView: 'home', canSeeHome: true })).toBe(false)
  })

  it('does not reveal the home view from cache while an admin route is booting', () => {
    expect(shouldRevealHomeFromLocalSnapshot({ booting: true, adminPath: false, homeView: 'home' })).toBe(true)
    expect(shouldRevealHomeFromLocalSnapshot({ booting: true, adminPath: true, homeView: 'home' })).toBe(false)
    expect(shouldRevealHomeFromLocalSnapshot({ booting: false, adminPath: false, homeView: 'home' })).toBe(false)
    expect(shouldRevealHomeFromLocalSnapshot({ booting: true, adminPath: false, homeView: 'login' })).toBe(false)
  })
})
