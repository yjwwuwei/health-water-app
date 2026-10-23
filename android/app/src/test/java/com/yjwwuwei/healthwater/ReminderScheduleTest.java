package com.yjwwuwei.healthwater;
import org.junit.Test;
import java.time.Instant;
import java.time.ZonedDateTime;
import static org.junit.Assert.*;
public class ReminderScheduleTest {
    @Test public void goalStopsTodayAndResumesTomorrowWithoutOpeningApp() {
        ZonedDateTime now = ZonedDateTime.parse("2026-10-22T12:00:00+08:00[Asia/Shanghai]");
        long result = ReminderSchedule.next(now, 540, 1260, 90, "2026-10-22", 0);
        assertEquals("2026-10-23T09:00+08:00[Asia/Shanghai]", Instant.ofEpochMilli(result).atZone(now.getZone()).toString());
    }
    @Test public void daylightSavingUsesLocalCalendar() {
        ZonedDateTime now = ZonedDateTime.parse("2026-03-07T22:00:00-05:00[America/New_York]");
        long result = ReminderSchedule.next(now, 540, 1260, 90, "", 0);
        assertEquals("2026-03-08T09:00-04:00[America/New_York]", Instant.ofEpochMilli(result).atZone(now.getZone()).toString());
    }
    @Test public void snoozeCannotEscapeQuietHours() {
        ZonedDateTime now = ZonedDateTime.parse("2026-10-22T20:55:00+08:00[Asia/Shanghai]");
        long result = ReminderSchedule.next(now, 540, 1260, 90, "", now.plusMinutes(15).toInstant().toEpochMilli());
        assertEquals("2026-10-23T09:00+08:00[Asia/Shanghai]", Instant.ofEpochMilli(result).atZone(now.getZone()).toString());
    }
}
