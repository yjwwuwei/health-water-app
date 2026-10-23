export interface Point {
  name?: string
  x: number
  y: number
  score?: number
}
export function drinkingGesture(points: Point[]): boolean {
  const byName = new Map(points.filter((p) => (p.score ?? 0) >= 0.4).map((p) => [p.name, p]))
  const nose = byName.get('nose'),
    left = byName.get('left_shoulder'),
    right = byName.get('right_shoulder')
  if (!nose || !left || !right) return false
  const shoulderWidth = Math.hypot(left.x - right.x, left.y - right.y)
  if (shoulderWidth < 20) return false
  return ['left_wrist', 'right_wrist'].some((name) => {
    const wrist = byName.get(name)
    return (
      wrist &&
      Math.hypot(wrist.x - nose.x, wrist.y - nose.y) < shoulderWidth * 0.85 &&
      wrist.y < (left.y + right.y) / 2
    )
  })
}
