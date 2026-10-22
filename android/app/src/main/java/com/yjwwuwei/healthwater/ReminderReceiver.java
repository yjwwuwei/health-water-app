package com.yjwwuwei.healthwater;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import java.time.ZonedDateTime;

public class ReminderReceiver extends BroadcastReceiver {
    static final String CHANNEL = "water-reminders-v3";
    static final String FIRE = "com.yjwwuwei.healthwater.REMIND";
    static final String SNOOZE = "com.yjwwuwei.healthwater.SNOOZE";
    static SharedPreferences prefs(Context context) { return context.getSharedPreferences("water-reminders-v3", Context.MODE_PRIVATE); }
    static boolean allowed(Context context) {
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        NotificationChannel channel = Build.VERSION.SDK_INT >= 26 ? notifications.getNotificationChannel(CHANNEL) : null;
        return (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && notifications.areNotificationsEnabled() && (channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE);
    }
    static void schedule(Context context) {
        SharedPreferences p = prefs(context); AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent pending = PendingIntent.getBroadcast(context, 30, new Intent(context, ReminderReceiver.class).setAction(FIRE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.cancel(pending);
        if (!p.getBoolean("enabled", false) || !allowed(context)) { p.edit().putLong("nextAt", 0).remove("snoozeAt").apply(); context.getSystemService(NotificationManager.class).cancel(30); return; }
        ZonedDateTime now = ZonedDateTime.now(); String goalMetDay = p.getString("goalMetDay", "");
        long next = ReminderSchedule.next(now, p.getInt("start", 540), p.getInt("end", 1260), p.getInt("interval", 90), goalMetDay, p.getLong("snoozeAt", 0));
        p.edit().putLong("nextAt", next).apply();
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pending);
        if (now.toLocalDate().toString().equals(goalMetDay)) context.getSystemService(NotificationManager.class).cancel(30);
    }
    @Override public void onReceive(Context context, Intent intent) {
        String action = intent.getAction(); SharedPreferences p = prefs(context);
        if (SNOOZE.equals(action)) {
            p.edit().putLong("snoozeAt", System.currentTimeMillis() + 15 * 60 * 1000).commit();
            context.getSystemService(NotificationManager.class).cancel(30); schedule(context); return;
        }
        if (FIRE.equals(action)) {
            p.edit().remove("snoozeAt").commit(); ZonedDateTime now = ZonedDateTime.now(); int minute = now.getHour() * 60 + now.getMinute();
            if (p.getBoolean("enabled", false) && allowed(context) && !now.toLocalDate().toString().equals(p.getString("goalMetDay", "")) && minute >= p.getInt("start", 540) && minute < p.getInt("end", 1260)) show(context);
        }
        if (FIRE.equals(action) || Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) schedule(context);
    }
    private void show(Context context) {
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "饮水提醒", NotificationManager.IMPORTANCE_DEFAULT));
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (open == null) return;
        open.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(context, 31, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent snooze = PendingIntent.getBroadcast(context, 32, new Intent(context, ReminderReceiver.class).setAction(SNOOZE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        notifications.notify(30, new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_water_notification).setContentTitle("给自己一点水分")
            .setContentText("歇一歇，按自己的节奏补充水分。").setAutoCancel(true).setContentIntent(content)
            .addAction(0, "去记录", content).addAction(0, "15 分钟后提醒", snooze).build());
    }
}
