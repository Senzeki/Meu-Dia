package com.meudia.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;
import java.lang.ref.WeakReference;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Queue;

@CapacitorPlugin(name = "MeuDiaNative")
public class MeuDiaNativePlugin extends Plugin {

    public static final String PREFS_ALARMS = "meudia_alarms";
    public static final String CHANNEL_CALL_ALARM = "meudia_call_alarm";
    public static final String CHANNEL_MESSAGES = "meudia_messages";

    private static WeakReference<MeuDiaNativePlugin> activeInstance = new WeakReference<>(null);
    private static final Queue<JSObject> pendingShares = new ArrayDeque<>();
    private static final Queue<JSObject> pendingNotificationActions = new ArrayDeque<>();

    @Override
    public void load() {
        super.load();
        activeInstance = new WeakReference<>(this);
        createNotificationChannels(getContext());
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel alarmChannel = new NotificationChannel(
            CHANNEL_CALL_ALARM,
            "Alertas importantes (Modo Ligação)",
            NotificationManager.IMPORTANCE_HIGH
        );
        alarmChannel.setDescription("Lembretes críticos em tela cheia do Meu Dia");
        alarmChannel.enableVibration(true);
        alarmChannel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alarmChannel);

        NotificationChannel msgChannel = new NotificationChannel(
            CHANNEL_MESSAGES,
            "Mensagens e lembretes",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        msgChannel.setDescription("Avisos do assistente e recados do Mural");
        nm.createNotificationChannel(msgChannel);
    }

    public static void deliverSharePayload(JSObject payload) {
        MeuDiaNativePlugin instance = activeInstance.get();
        if (instance != null && instance.hasListeners("shareReceived")) {
            instance.notifyListeners("shareReceived", payload);
        } else {
            synchronized (pendingShares) {
                pendingShares.add(payload);
            }
        }
    }

    public static void deliverNotificationAction(JSObject payload) {
        MeuDiaNativePlugin instance = activeInstance.get();
        if (instance != null && instance.hasListeners("notificationAction")) {
            instance.notifyListeners("notificationAction", payload);
        } else {
            synchronized (pendingNotificationActions) {
                pendingNotificationActions.add(payload);
            }
        }
    }

    public static void notifyNewFcmToken(String token) {
        if (token == null || token.isEmpty()) return;
        MeuDiaNativePlugin instance = activeInstance.get();
        if (instance != null && instance.hasListeners("fcmTokenUpdated")) {
            JSObject payload = new JSObject();
            payload.put("token", token);
            instance.notifyListeners("fcmTokenUpdated", payload);
        }
    }

    @PluginMethod
    public void getFcmToken(PluginCall call) {
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnCompleteListener(task -> {
                    JSObject ret = new JSObject();
                    if (task.isSuccessful() && task.getResult() != null) {
                        ret.put("token", task.getResult());
                    } else {
                        ret.put("token", JSObject.NULL);
                    }
                    call.resolve(ret);
                });
        } catch (Exception ex) {
            JSObject ret = new JSObject();
            ret.put("token", JSObject.NULL);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void consumePendingShare(PluginCall call) {
        JSObject next;
        synchronized (pendingShares) {
            next = pendingShares.poll();
        }
        JSObject result = new JSObject();
        result.put("payload", next);
        call.resolve(result);
    }

    @PluginMethod
    public void consumePendingNotificationAction(PluginCall call) {
        JSObject next;
        synchronized (pendingNotificationActions) {
            next = pendingNotificationActions.poll();
        }
        JSObject result = new JSObject();
        result.put("payload", next);
        call.resolve(result);
    }

    @PluginMethod
    public void getDiagnostics(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        ret.put("platform", "android");
        ret.put("notifications_permission", checkNotificationsPermission(ctx));
        ret.put("exact_alarms_allowed", checkExactAlarmsAllowed(ctx));
        ret.put("full_screen_intent_allowed", checkFullScreenIntentAllowed(ctx));
        ret.put("battery_optimization_ignored", checkBatteryOptimizationIgnored(ctx));
        ret.put("checked_at", Instant.now().toString());
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                if (getActivity() != null) {
                    getActivity().requestPermissions(
                        new String[] { Manifest.permission.POST_NOTIFICATIONS },
                        19042
                    );
                }
            }
        }
        getDiagnostics(call);
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        String target = call.getString("target", "notifications");
        Context ctx = getContext();
        Intent intent = buildSettingsIntent(ctx, target);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(intent);
        } catch (Exception ex) {
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallback.setData(Uri.fromParts("package", ctx.getPackageName(), null));
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(fallback);
        }
        call.resolve();
    }

    @PluginMethod
    public void scheduleExactCallAlarm(PluginCall call) {
        String jobId = call.getString("jobId");
        String title = call.getString("title", "Lembrete importante");
        String body = call.getString("body", "");
        Double triggerDouble = call.getDouble("triggerAtMillis");
        String deepLinkMessageId = call.getString("deepLinkMessageId", "");

        if (jobId == null || jobId.isEmpty() || triggerDouble == null) {
            call.reject("jobId e triggerAtMillis são obrigatórios.");
            return;
        }

        long triggerAtMillis = triggerDouble.longValue();
        scheduleAlarmInternal(
            getContext(),
            jobId,
            title,
            body,
            triggerAtMillis,
            deepLinkMessageId
        );
        call.resolve();
    }

    public static void scheduleAlarmInternal(
        Context ctx,
        String jobId,
        String title,
        String body,
        long triggerAtMillis,
        String deepLinkMessageId
    ) {
        if (triggerAtMillis <= System.currentTimeMillis()) return;

        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE);
        prefs
            .edit()
            .putString("title_" + jobId, title)
            .putString("body_" + jobId, body)
            .putString("deep_link_" + jobId, deepLinkMessageId != null ? deepLinkMessageId : "")
            .remove("last_fired_" + jobId)
            .apply();

        Intent receiverIntent = new Intent(ctx, CallAlarmReceiver.class);
        receiverIntent.putExtra("job_id", jobId);
        receiverIntent.putExtra("title", title);
        receiverIntent.putExtra("body", body);
        receiverIntent.putExtra("deep_link_message_id", deepLinkMessageId);

        int requestCode = Math.abs(jobId.hashCode());
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            ctx,
            requestCode,
            receiverIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            return;
        }

        Intent showIntent = new Intent(ctx, MainActivity.class);
        PendingIntent showPending = PendingIntent.getActivity(
            ctx,
            requestCode + 1,
            showIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager.AlarmClockInfo clockInfo = new AlarmManager.AlarmClockInfo(
            triggerAtMillis,
            showPending
        );
        alarmManager.setAlarmClock(clockInfo, pendingIntent);
    }

    @PluginMethod
    public void cancelExactCallAlarm(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null || jobId.isEmpty()) {
            call.resolve();
            return;
        }
        Context ctx = getContext();
        Intent receiverIntent = new Intent(ctx, CallAlarmReceiver.class);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            ctx,
            Math.abs(jobId.hashCode()),
            receiverIntent,
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager alarmManager = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null && pendingIntent != null) {
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
        ctx.getSharedPreferences(PREFS_ALARMS, Context.MODE_PRIVATE)
            .edit()
            .remove("title_" + jobId)
            .remove("body_" + jobId)
            .remove("deep_link_" + jobId)
            .remove("last_fired_" + jobId)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void showMessageNotification(PluginCall call) {
        String jobId = call.getString("jobId", String.valueOf(System.currentTimeMillis()));
        String title = call.getString("title", "Meu Dia");
        String body = call.getString("body", "");
        String entityType = call.getString("entityType", "task");
        String entityId = call.getString("entityId", "");
        String deepLinkMessageId = call.getString("deepLinkMessageId", "");

        showMessageNotificationInternal(
            getContext(),
            jobId,
            title,
            body,
            entityType,
            entityId,
            deepLinkMessageId
        );
        call.resolve();
    }

    public static void showMessageNotificationInternal(
        Context ctx,
        String jobId,
        String title,
        String body,
        String entityType,
        String entityId,
        String deepLinkMessageId
    ) {
        createNotificationChannels(ctx);

        int notifId = Math.abs(jobId.hashCode());

        Intent openIntent = new Intent(ctx, NotificationActionReceiver.class);
        openIntent.setAction("com.meudia.app.ACTION_OPEN");
        openIntent.putExtra("action", "open");
        openIntent.putExtra("notif_id", notifId);
        openIntent.putExtra("job_id", jobId);
        openIntent.putExtra("entity_type", entityType);
        openIntent.putExtra("entity_id", entityId);
        openIntent.putExtra("deep_link_message_id", deepLinkMessageId);

        PendingIntent openPending = PendingIntent.getBroadcast(
            ctx,
            notifId + 10,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent snoozeIntent = new Intent(ctx, NotificationActionReceiver.class);
        snoozeIntent.setAction("com.meudia.app.ACTION_SNOOZE_1H");
        snoozeIntent.putExtra("action", "snooze_1h");
        snoozeIntent.putExtra("notif_id", notifId);
        snoozeIntent.putExtra("job_id", jobId);
        snoozeIntent.putExtra("entity_type", entityType);
        snoozeIntent.putExtra("entity_id", entityId);
        snoozeIntent.putExtra("deep_link_message_id", deepLinkMessageId);

        PendingIntent snoozePending = PendingIntent.getBroadcast(
            ctx,
            notifId + 11,
            snoozeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent completeIntent = new Intent(ctx, NotificationActionReceiver.class);
        completeIntent.setAction("com.meudia.app.ACTION_COMPLETE");
        completeIntent.putExtra("action", "complete");
        completeIntent.putExtra("notif_id", notifId);
        completeIntent.putExtra("job_id", jobId);
        completeIntent.putExtra("entity_type", entityType);
        completeIntent.putExtra("entity_id", entityId);
        completeIntent.putExtra("deep_link_message_id", deepLinkMessageId);

        PendingIntent completePending = PendingIntent.getBroadcast(
            ctx,
            notifId + 12,
            completeIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, CHANNEL_MESSAGES)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(openPending)
            .setAutoCancel(true)
            .addAction(0, "Adiar 1h", snoozePending)
            .addAction(0, "Concluir", completePending);

        NotificationManagerCompat.from(ctx).notify(notifId, builder.build());
    }

    private String checkNotificationsPermission(Context ctx) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (
                ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED
            ) {
                return "denied";
            }
        }
        return NotificationManagerCompat.from(ctx).areNotificationsEnabled() ? "granted" : "denied";
    }

    private String checkExactAlarmsAllowed(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return "granted";
        }
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        return (am != null && am.canScheduleExactAlarms()) ? "granted" : "denied";
    }

    private String checkFullScreenIntentAllowed(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            return "granted";
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        return (nm != null && nm.canUseFullScreenIntent()) ? "granted" : "denied";
    }

    private String checkBatteryOptimizationIgnored(Context ctx) {
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        if (pm == null) return "prompt";
        return pm.isIgnoringBatteryOptimizations(ctx.getPackageName()) ? "granted" : "prompt";
    }

    private Intent buildSettingsIntent(Context ctx, String target) {
        String pkg = ctx.getPackageName();
        if ("exact_alarm".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(Uri.parse("package:" + pkg));
            return intent;
        }
        if ("full_screen".equals(target) && Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
            intent.setData(Uri.parse("package:" + pkg));
            return intent;
        }
        if ("battery".equals(target)) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(pkg)) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + pkg));
                return intent;
            }
            return new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            return intent;
        }
        Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        details.setData(Uri.fromParts("package", pkg, null));
        return details;
    }
}
