package org.acapozhichalur.connect;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

/**
 * ACA Connect notification channels
 * =================================
 *
 * Android creates a channel the first time it is used and then lets the USER
 * control its importance, sound, vibration and lock-screen visibility. Code can
 * never upgrade an existing channel, which is why a channel that was created
 * once with the wrong (silent) settings stays silent forever.
 *
 * We therefore use versioned channel ids (`_v2`). The old auto-created channels
 * (`attendance_reminder`, `prayer_reminder` and Firebase's
 * `fcm_fallback_notification_channel`) are deleted on upgrade so users do not
 * keep a stale silent channel. If channel settings ever need to change again,
 * bump the suffix to `_v3` instead of editing these ids in place.
 *
 * IMPORTANCE_HIGH is required for heads-up banners. The user can still lower it
 * or silence the channel in Android Settings, and Do Not Disturb / silent mode
 * always win. That is expected Android behaviour, not something an app may
 * override.
 */
public final class NotificationChannels {

    public static final String ATTENDANCE = "aca_attendance_v2";
    public static final String PRAYER = "aca_prayer_v2";
    public static final String CHAT = "aca_chat_v2";
    public static final String GENERAL = "aca_general_v2";

    /** Channels created by earlier builds with incorrect / silent settings. */
    private static final String[] LEGACY_CHANNEL_IDS = {
        "attendance_reminder",
        "prayer_reminder",
        "fcm_fallback_notification_channel",
    };

    private NotificationChannels() {}

    /**
     * Create (or leave untouched) every ACA Connect channel. Safe to call on
     * every app start; Android ignores attempts to change an existing channel.
     */
    public static void createAll(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        for (String legacyId : LEGACY_CHANNEL_IDS) {
            try {
                manager.deleteNotificationChannel(legacyId);
            } catch (Exception ignored) {
                // Nothing to delete — the channel was never created.
            }
        }

        Uri sound = Settings.System.DEFAULT_NOTIFICATION_URI;
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();

        createChannel(
            manager,
            ATTENDANCE,
            "Attendance Reminders",
            "Reminders about attendance sessions.",
            NotificationManager.IMPORTANCE_HIGH,
            sound,
            audioAttributes
        );
        createChannel(
            manager,
            PRAYER,
            "Prayer Reminders",
            "Reminders about prayer requests.",
            NotificationManager.IMPORTANCE_HIGH,
            sound,
            audioAttributes
        );
        createChannel(
            manager,
            CHAT,
            "Chat Messages",
            "New group and private chat messages.",
            NotificationManager.IMPORTANCE_HIGH,
            sound,
            audioAttributes
        );
        createChannel(
            manager,
            GENERAL,
            "General Announcements",
            "Church announcements and general updates.",
            NotificationManager.IMPORTANCE_DEFAULT,
            sound,
            audioAttributes
        );
    }

    private static void createChannel(
        NotificationManager manager,
        String id,
        String name,
        String description,
        int importance,
        Uri sound,
        AudioAttributes audioAttributes
    ) {
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.setDescription(description);
        channel.setShowBadge(true);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 250, 250, 250 });
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.setSound(sound, audioAttributes);
        manager.createNotificationChannel(channel);
    }
}
