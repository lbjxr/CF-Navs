const ICON_CARD_TITLE_TRACK_MIN_WIDTH = 72

export function getIconCardTrackWidth(iconSize: number, showTitle: boolean): number {
  const safeIconSize = Number.isFinite(iconSize) ? Math.max(0, iconSize) : 0
  return showTitle ? Math.max(ICON_CARD_TITLE_TRACK_MIN_WIDTH, safeIconSize) : safeIconSize
}
