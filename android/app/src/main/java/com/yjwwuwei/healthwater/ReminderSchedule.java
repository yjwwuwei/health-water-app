package com.yjwwuwei.healthwater;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZonedDateTime;

/** Calendar-based slots. No fixed 24-hour duration, including across DST changes. */
public final class ReminderSchedule {
    private ReminderSchedule() {}
    public static long next(ZonedDateTime now, int startMinute, int endMinute, int interval, String goalMetDay, long snoozeAt) {
        if (startMinute < 0 || endMinute > 1440 || startMinute >= endMinute || interval < 30) throw new IllegalArgumentException("Invalid reminder window");
        if (snoozeAt > now.toInstant().toEpochMilli()) {
            ZonedDateTime snooze = java.time.Instant.ofEpochMilli(snoozeAt).atZone(now.getZone());
            int minute = snooze.getHour() * 60 + snooze.getMinute();
            if (!snooze.toLocalDate().toString().equals(goalMetDay) && minute >= startMinute && minute < endMinute) return snoozeAt;
        }
        for (int offset = 0; offset < 3; offset++) {
            LocalDate day = now.toLocalDate().plusDays(offset);
            if (day.toString().equals(goalMetDay)) continue;
            for (int minute = startMinute; minute < endMinute; minute += interval) {
                ZonedDateTime slot = day.atTime(LocalTime.of(minute / 60, minute % 60)).atZone(now.getZone());
                if (slot.isAfter(now)) return slot.toInstant().toEpochMilli();
            }
        }
        throw new IllegalStateException("No upcoming reminder slot");
    }
}
