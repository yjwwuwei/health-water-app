package com.yjwwuwei.healthwater;

import android.Manifest;
import android.os.Build;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.time.LocalTime;

@CapacitorPlugin(name = "WaterReminders", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class WaterRemindersPlugin extends Plugin {
    @Override @PluginMethod public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33) { permissionResult(call); return; }
        requestPermissionForAlias("notifications", call, "permissionResult");
    }
    @PermissionCallback private void permissionResult(PluginCall call) {
        JSObject result = new JSObject(); result.put("notifications", ReminderReceiver.allowed(getContext()) ? "granted" : "denied"); call.resolve(result);
    }
    @PluginMethod public void configure(PluginCall call) {
        try {
            LocalTime start = LocalTime.parse(call.getString("start", "09:00")); LocalTime end = LocalTime.parse(call.getString("end", "21:00"));
            int interval = call.getInt("intervalMinutes", 90);
            if (!start.isBefore(end) || (interval != 30 && interval != 60 && interval != 90 && interval != 120)) { call.reject("提醒时段或间隔无效"); return; }
            SharedPreferences p = ReminderReceiver.prefs(getContext()); String profile = call.getString("profile", "guest");
            SharedPreferences.Editor editor = p.edit().putBoolean("enabled", call.getBoolean("enabled", false)).putInt("start", start.getHour() * 60 + start.getMinute()).putInt("end", end.getHour() * 60 + end.getMinute()).putInt("interval", interval).putString("profile", profile).putString("goalMetDay", call.getString("goalMetDay", ""));
            if (!profile.equals(p.getString("profile", "guest"))) editor.remove("snoozeAt");
            if (!editor.commit()) { call.reject("提醒设置未能保存，请重试"); return; }
            ReminderReceiver.schedule(getContext()); status(call);
        } catch (Exception error) { call.reject("无法配置提醒", error); }
    }
    @PluginMethod public void status(PluginCall call) {
        SharedPreferences p = ReminderReceiver.prefs(getContext()); JSObject result = new JSObject();
        result.put("permission", ReminderReceiver.allowed(getContext()) ? "granted" : "denied"); result.put("enabled", p.getBoolean("enabled", false)); result.put("nextAt", p.getLong("nextAt", 0)); call.resolve(result);
    }
}
