package com.yjwwuwei.healthwater;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle state) {
        registerPlugin(WaterRemindersPlugin.class);
        registerPlugin(WaterFilesPlugin.class);
        super.onCreate(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("(function(){const d=document.querySelector('dialog[open]');if(d){d.dispatchEvent(new Event('cancel',{cancelable:true}));return true;}return false;})()", handled -> {
                    if (!"true".equals(handled)) { setEnabled(false); getOnBackPressedDispatcher().onBackPressed(); setEnabled(true); }
                });
            }
        });
    }
}
