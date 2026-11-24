package com.meudia.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

public class CallAlarmReceiver extends BroadcastReceiver {

    private static final long DEDUPE_WINDOW_MS = 5 * 60 * 1000L;

    @Override
    public void onReceive(Context context, Intent intent) {
        String jobId = intent.getStringExtra("job_id");
        if (jobId == null || jobId.isEmpty()) {
            jobId = "local-" + System.currentTimeMillis();
        }

        SharedPreferences prefs = context.getSharedPreferences(
            MeuDiaNativePlugin.PREFS_ALARMS,
            Context.MODE_PRIVATE
        );
        long lastFired = prefs.getLong("last_fired_" + jobId, 0L);
        long now = System.currentTimeMillis();
        if (lastFired > 0L && (now - lastFired) < DEDUPE_WINDOW_MS) {
            // Deduplicado dentro da janela de 5 min (push FCM + alarme local)
            return;
        }
        prefs.edit().putLong("last_fired_" + jobId, now).apply();

        String title = intent.getStringExtra("title");
        if (title == null || title.isEmpty()) title = "Lembrete importante";
        String body = intent.getStringExtra("body");
        if (body == null) body = "";
        String deepLinkMessageId = intent.getStringExtra("deep_link_message_id");

        MeuDiaNativePlugin.createNotificationChannels(context);

        Intent fullScreenIntent = new Intent(context, CallAlarmActivity.class);
        fullScreenIntent.putExtra("job_id", jobId);
        fullScreenIntent.putExtra("title", title);
        fullScreenIntent.putExtra("body", body);
        fullScreenIntent.putExtra("deep_link_message_id", deepLinkMessageId);
        fullScreenIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );

        int notifId = Math.abs(jobId.hashCode());
        PendingIntent fullScreenPending = PendingIntent.getActivity(
            context,
            notifId,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            MeuDiaNativePlugin.CHANNEL_CALL_ALARM
        )
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(fullScreenPending)
            .setAutoCancel(true);

        NotificationManagerCompat.from(context).notify(notifId, builder.build());
    }
}
