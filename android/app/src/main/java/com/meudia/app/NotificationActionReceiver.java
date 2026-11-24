package com.meudia.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;

public class NotificationActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getStringExtra("action");
        if (action == null || action.isEmpty()) action = "open";

        int notifId = intent.getIntExtra("notif_id", 0);
        if (notifId != 0) {
            NotificationManagerCompat.from(context).cancel(notifId);
        }

        JSObject payload = new JSObject();
        payload.put("action", action);
        payload.put("job_id", intent.getStringExtra("job_id"));
        payload.put("entity_type", intent.getStringExtra("entity_type"));
        payload.put("entity_id", intent.getStringExtra("entity_id"));
        payload.put("deep_link_message_id", intent.getStringExtra("deep_link_message_id"));

        MeuDiaNativePlugin.deliverNotificationAction(payload);

        if ("open".equals(action)) {
            Intent launch = new Intent(context, MainActivity.class);
            launch.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_SINGLE_TOP |
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            launch.putExtra(
                "deep_link_message_id",
                intent.getStringExtra("deep_link_message_id")
            );
            context.startActivity(launch);
        }
    }
}
