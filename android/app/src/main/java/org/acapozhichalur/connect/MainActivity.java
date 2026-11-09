package org.acapozhichalur.connect;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Create/refresh the Android notification channels before Capacitor
        // starts. Channels must exist before the first FCM message arrives,
        // otherwise Firebase creates a fallback channel with silent defaults.
        NotificationChannels.createAll(this);
        super.onCreate(savedInstanceState);
    }
}
