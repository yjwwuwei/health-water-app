export function localDate(
  value: number | Date = Date.now(),
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  return ['year', 'month', 'day'].map((type) => parts.find((p) => p.type === type)!.value).join('-')
}
export function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  )
}
export function shiftDate(date: string, days: number): string {
  if (!validDate(date)) throw new Error('日期无效')
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function monthRange(date: string): [string, string] {
  const start = `${date.slice(0, 7)}-01`
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return [start, shiftDate(d.toISOString().slice(0, 10), -1)]
}
export function weekRange(date: string): [string, string] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const start = shiftDate(date, -((weekday + 6) % 7))
  return [start, shiftDate(start, 6)]
}
export function dateRange(start: string, end: string): string[] {
  const result: string[] = []
  for (let d = start; d <= end; d = shiftDate(d, 1)) result.push(d)
  return result
}
export function positiveMl(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000)
    throw new Error('请输入 1–100000 之间的整数毫升数')
  return value
}
