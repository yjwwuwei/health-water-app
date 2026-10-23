package com.yjwwuwei.healthwater;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "WaterFiles")
public class WaterFilesPlugin extends Plugin {
    @PluginMethod public void save(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE, call.getString("name", "water-backup.json"));
        startActivityForResult(call, intent, "fileSaved");
    }
    @ActivityCallback private void fileSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) { response.put("saved", false); call.resolve(response); return; }
        Uri uri = result.getData().getData();
        if (uri == null) { call.reject("未获得备份文件位置"); return; }
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) { call.reject("无法写入备份文件"); return; }
            output.write(call.getString("contents", "").getBytes(StandardCharsets.UTF_8)); output.flush(); response.put("saved", true); call.resolve(response);
        } catch (Exception error) { call.reject("备份写入失败，应用内数据仍保留", error); }
    }
}
