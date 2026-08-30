const INFO_CARD_MIN_TRACK_WIDTH = 44
const INFO_CARD_MAX_TRACK_WIDTH = 400
const INFO_CARD_DEFAULT_TRACK_WIDTH = 200
const INFO_CARD_MOBILE_SAFE_MIN_TRACK_WIDTH = 150

export function getInfoCardTrackWidth(cardWidth: number): number {
  const safeCardWidth = Number.isFinite(cardWidth) ? cardWidth : INFO_CARD_DEFAULT_TRACK_WIDTH
  return Math.min(INFO_CARD_MAX_TRACK_WIDTH, Math.max(INFO_CARD_MIN_TRACK_WIDTH, safeCardWidth))
}

export function getInfoCardMobileTrackWidth(cardWidth: number): number {
  return Math.max(INFO_CARD_MOBILE_SAFE_MIN_TRACK_WIDTH, getInfoCardTrackWidth(cardWidth))
}

const ICON_CARD_TITLE_TRACK_MIN_WIDTH = 72

export function getIconCardTrackWidth(iconSize: number, showTitle: boolean): number {
  const safeIconSize = Number.isFinite(iconSize) ? Math.max(0, iconSize) : 0
  return showTitle ? Math.max(ICON_CARD_TITLE_TRACK_MIN_WIDTH, safeIconSize) : safeIconSize
}
