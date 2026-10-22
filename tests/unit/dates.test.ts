import { expect, it } from 'vitest'
import { localDate, weekRange, monthRange, shiftDate, validDate } from '../../src/core/dates'
it('uses local calendar dates around midnight and DST', () => {
  expect(localDate(Date.parse('2026-10-20T17:30:00Z'), 'Asia/Shanghai')).toBe('2026-10-21')
  expect(localDate(Date.parse('2026-03-08T07:30:00Z'), 'America/New_York')).toBe('2026-03-08')
  expect(weekRange('2026-10-25')).toEqual(['2026-10-19', '2026-10-25'])
  expect(monthRange('2024-02-15')).toEqual(['2024-02-01', '2024-02-29'])
  expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29')
  expect(validDate('2024-02-30')).toBe(false)
})
