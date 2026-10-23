import { expect, it } from 'vitest'
import { drinkingGesture } from '../../src/pose/gesture'
it('compares pixel coordinates using body scale and requires visible shoulders', () => {
  const points = [
    { name: 'nose', x: 200, y: 100, score: 0.9 },
    { name: 'left_shoulder', x: 150, y: 170, score: 0.9 },
    { name: 'right_shoulder', x: 250, y: 170, score: 0.9 },
    { name: 'left_wrist', x: 210, y: 110, score: 0.9 },
  ]
  expect(drinkingGesture(points)).toBe(true)
  expect(drinkingGesture(points.map((p) => ({ ...p, x: p.x * 2, y: p.y * 2 })))).toBe(true)
  expect(drinkingGesture(points.map((p) => (p.name === 'left_wrist' ? { ...p, y: 300 } : p)))).toBe(false)
  expect(drinkingGesture(points.filter((p) => p.name !== 'nose'))).toBe(false)
})
