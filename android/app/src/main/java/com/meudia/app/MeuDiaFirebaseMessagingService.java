package com.meudia.app;

import android.content.Context;
import android.content.Intent;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class MeuDiaFirebaseMessagingService extends FirebaseMessagingService {

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        MeuDiaNativePlugin.notifyNewFcmToken(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            return;
        }

        Context ctx = getApplicationContext();
        String jobId = data.getOrDefault("job_id", "fcm-" + System.currentTimeMillis());
        String deliveryMode = data.getOrDefault("delivery_mode", "push");
        String title = data.getOrDefault("title", "Meu Dia");
        String body = data.getOrDefault("body", "");
        String entityType = data.getOrDefault("entity_type", "task");
        String entityId = data.getOrDefault("entity_id", "");
        String deepLinkMessageId = data.getOrDefault("deep_link_message_id", "");

        if ("call_alarm".equals(deliveryMode)) {
            Intent alarmIntent = new Intent(ctx, CallAlarmReceiver.class);
            alarmIntent.putExtra("job_id", jobId);
            alarmIntent.putExtra("title", title);
            alarmIntent.putExtra("body", body);
            alarmIntent.putExtra("deep_link_message_id", deepLinkMessageId);
            new CallAlarmReceiver().onReceive(ctx, alarmIntent);
            return;
        }

        MeuDiaNativePlugin.showMessageNotificationInternal(
            ctx,
            jobId,
            title,
            body,
            entityType,
            entityId,
            deepLinkMessageId
        );
    }
}
