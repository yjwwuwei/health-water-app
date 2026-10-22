package com.yjwwuwei.healthwater;

import static org.junit.Assert.*;
import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.time.ZonedDateTime;
import java.util.function.BooleanSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ReminderIntegrationTest {
    private Context context;
    @Before public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.yjwwuwei.healthwater.dev", context.getPackageName());
        if (Build.VERSION.SDK_INT >= 33) InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        ReminderReceiver.prefs(context).edit().clear().putBoolean("enabled", true).putInt("start", 540).putInt("end", 1260).putInt("interval", 90).commit();
    }
    @After public void tearDown() {
        ReminderReceiver.prefs(context).edit().clear().commit(); ReminderReceiver.schedule(context);
    }
    @Test public void persistedScheduleRestoresOnBootAndClockChanges() {
        ReminderReceiver receiver = new ReminderReceiver();
        receiver.onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertTrue(ReminderReceiver.prefs(context).getLong("nextAt", 0) > System.currentTimeMillis());
        receiver.onReceive(context, new Intent(Intent.ACTION_TIMEZONE_CHANGED));
        assertTrue(ReminderReceiver.prefs(context).getLong("nextAt", 0) > System.currentTimeMillis());
    }
    @Test public void goalMetPausesUntilTomorrowAndDisableCancels() {
        ZonedDateTime now = ZonedDateTime.now();
        ReminderReceiver.prefs(context).edit().putString("goalMetDay", now.toLocalDate().toString()).commit();
        ReminderReceiver.schedule(context);
        long tomorrow = now.toLocalDate().plusDays(1).atStartOfDay(now.getZone()).toInstant().toEpochMilli();
        assertTrue(ReminderReceiver.prefs(context).getLong("nextAt", 0) >= tomorrow);
        ReminderReceiver.prefs(context).edit().putBoolean("enabled", false).commit(); ReminderReceiver.schedule(context);
        assertEquals(0, ReminderReceiver.prefs(context).getLong("nextAt", -1));
    }
    @Test public void deliveredNotificationCanBeSnoozedAndWithdrawnAtGoal() throws Exception {
        // A full-day test window avoids depending on the machine's current time.
        ReminderReceiver.prefs(context).edit().putInt("start", 0).putInt("end", 1440).commit();
        ReminderReceiver receiver = new ReminderReceiver();
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        receiver.onReceive(context, new Intent(ReminderReceiver.FIRE));
        awaitCondition(() -> notifications.getActiveNotifications().length == 1);
        StatusBarNotification posted = notifications.getActiveNotifications()[0];
        assertEquals(30, posted.getId());
        assertEquals(ReminderReceiver.CHANNEL, posted.getNotification().getChannelId());
        Notification.Action snooze = posted.getNotification().actions[1];
        assertEquals("15 分钟后提醒", snooze.title.toString());
        long pressedAt = System.currentTimeMillis();
        // Send the actual PendingIntent so Android dispatches the private receiver.
        snooze.actionIntent.send();
        awaitCondition(() -> ReminderReceiver.prefs(context).getLong("snoozeAt", 0) > pressedAt);
        awaitCondition(() -> notifications.getActiveNotifications().length == 0);
        long snoozeAt = ReminderReceiver.prefs(context).getLong("snoozeAt", 0);
        assertTrue(snoozeAt >= pressedAt + 15 * 60 * 1000);
        assertTrue(snoozeAt < System.currentTimeMillis() + 16 * 60 * 1000);
        long nextAt = ReminderReceiver.prefs(context).getLong("nextAt", 0);
        assertTrue(nextAt >= snoozeAt); // A snooze across midnight may use tomorrow's slot.

        receiver.onReceive(context, new Intent(ReminderReceiver.FIRE));
        awaitCondition(() -> notifications.getActiveNotifications().length == 1);
        ReminderReceiver.prefs(context).edit().putString("goalMetDay", ZonedDateTime.now().toLocalDate().toString()).commit();
        ReminderReceiver.schedule(context);
        awaitCondition(() -> notifications.getActiveNotifications().length == 0);
    }
    private static void awaitCondition(BooleanSupplier condition) {
        long deadline = SystemClock.elapsedRealtime() + 5000;
        while (!condition.getAsBoolean() && SystemClock.elapsedRealtime() < deadline) SystemClock.sleep(50);
        assertTrue("Android service did not reach the expected state", condition.getAsBoolean());
    }
}
