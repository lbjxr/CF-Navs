// Deliberately distinct opaque quadrants: no fonts, external resources, random
// colors or image decoder-derived expectations. Pixel oracle is computed from
// the authored colors, independently of browser rendering.
function image(colors) {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    colors.map((color, i) => `<rect x="${i % 2 * 16}" y="${Math.floor(i / 2) * 16}" width="16" height="16" fill="rgb(${color.join(',')})"/>`).join('') + '</svg>'
  const pixels = []
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) pixels.push(...colors[(y >= 4 ? 2 : 0) + (x >= 4 ? 1 : 0)], 255)
  return { uri: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), base64Uri: 'data:image/svg+xml;base64,' + btoa(svg), pixels }
}
export function createIconAcceptanceFixtures() {
  return {
    bookmark: image([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]]),
    category: image([[0, 255, 255], [255, 0, 255], [0, 0, 0], [255, 255, 255]]),
  }
}
