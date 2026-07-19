export type AppView = 'home' | 'admin' | 'login'

type HomeAccessInput = {
  publicMode: boolean | null | undefined
  authenticated: boolean
}

export type HomeGateState = {
  view: Extract<AppView, 'home' | 'login'>
  loginModalOpen: boolean
}

type HomeViewGuardInput = {
  booting: boolean
  currentView: AppView
  canSeeHome: boolean
}

type LocalSnapshotRevealInput = {
  booting: boolean
  adminPath: boolean
  homeView: Extract<AppView, 'home' | 'login'>
}

export function canSeeHomeView(input: HomeAccessInput): boolean {
  return Boolean(input.publicMode || input.authenticated)
}

export function getHomeGateView(input: HomeAccessInput): Extract<AppView, 'home' | 'login'> {
  return input.publicMode === false && !input.authenticated ? 'login' : 'home'
}

export function createHomeGateState(input: HomeAccessInput): HomeGateState {
  const view = getHomeGateView(input)
  return {
    view,
    loginModalOpen: view === 'login',
  }
}

export function shouldOpenLoginGate(input: HomeViewGuardInput): boolean {
  return !input.booting && input.currentView === 'home' && !input.canSeeHome
}

export function shouldRevealHomeFromLocalSnapshot(input: LocalSnapshotRevealInput): boolean {
  return input.booting && !input.adminPath && input.homeView === 'home'
}
