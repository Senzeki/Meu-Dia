package com.meudia.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;

public class CallAlarmActivity extends AppCompatActivity {

    private Ringtone ringtone;
    private Vibrator vibrator;
    private String jobId;
    private String title;
    private String body;
    private String deepLinkMessageId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, null);
            }
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        jobId = getIntent().getStringExtra("job_id");
        if (jobId == null) jobId = "";
        title = getIntent().getStringExtra("title");
        if (title == null || title.isEmpty()) title = "Lembrete importante";
        body = getIntent().getStringExtra("body");
        if (body == null) body = "";
        deepLinkMessageId = getIntent().getStringExtra("deep_link_message_id");

        buildContentView();
        startAlarmFeedback();
    }

    private void buildContentView() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0B0F17"));
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView badge = new TextView(this);
        badge.setText("Meu Dia • Alerta importante");
        badge.setTextColor(Color.parseColor("#6EE7B7"));
        badge.setTextSize(14f);
        badge.setGravity(Gravity.CENTER);

        TextView titleView = new TextView(this);
        titleView.setText(title);
        titleView.setTextColor(Color.parseColor("#F8FAFC"));
        titleView.setTextSize(26f);
        titleView.setTypeface(Typeface.DEFAULT_BOLD);
        titleView.setGravity(Gravity.CENTER);
        titleView.setPadding(0, dp(16), 0, dp(10));

        TextView bodyView = new TextView(this);
        bodyView.setText(body);
        bodyView.setTextColor(Color.parseColor("#CBD5E1"));
        bodyView.setTextSize(17f);
        bodyView.setGravity(Gravity.CENTER);
        bodyView.setPadding(0, 0, 0, dp(36));

        Button answerBtn = new Button(this);
        answerBtn.setText("Atender");
        answerBtn.setAllCaps(false);
        answerBtn.setTextSize(16f);
        answerBtn.setTextColor(Color.parseColor("#08110B"));
        answerBtn.setBackgroundColor(Color.parseColor("#34D399"));
        answerBtn.setMinimumHeight(dp(52));
        answerBtn.setOnClickListener(v -> onAnswerClicked());

        Button snoozeBtn = new Button(this);
        snoozeBtn.setText("Adiar 10 min");
        snoozeBtn.setAllCaps(false);
        snoozeBtn.setTextSize(15f);
        snoozeBtn.setTextColor(Color.parseColor("#E2E8F0"));
        snoozeBtn.setBackgroundColor(Color.parseColor("#1E293B"));
        snoozeBtn.setMinimumHeight(dp(48));
        snoozeBtn.setOnClickListener(v -> onSnoozeClicked());

        LinearLayout.LayoutParams btnParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        btnParams.bottomMargin = dp(14);

        root.addView(badge);
        root.addView(titleView);
        root.addView(bodyView);
        root.addView(answerBtn, btnParams);
        root.addView(snoozeBtn, btnParams);

        setContentView(root);
    }

    private void startAlarmFeedback() {
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) {
                alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            }
            if (alarmUri != null) {
                ringtone = RingtoneManager.getRingtone(getApplicationContext(), alarmUri);
                if (ringtone != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        ringtone.setAudioAttributes(
                            new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                        );
                    }
                    ringtone.play();
                }
            }
        } catch (Exception ignored) {
            // Sem toque disponível no emulador
        }

        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = { 0, 500, 600 };
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception ignored) {
            // Ignora falha de vibração
        }
    }

    private void stopAlarmFeedback() {
        if (ringtone != null && ringtone.isPlaying()) {
            ringtone.stop();
        }
        if (vibrator != null) {
            vibrator.cancel();
        }
        if (!jobId.isEmpty()) {
            NotificationManagerCompat.from(this).cancel(Math.abs(jobId.hashCode()));
        }
    }

    private void onAnswerClicked() {
        stopAlarmFeedback();

        JSObject payload = new JSObject();
        payload.put("action", "open");
        payload.put("job_id", jobId);
        payload.put("deep_link_message_id", deepLinkMessageId != null ? deepLinkMessageId : "");
        MeuDiaNativePlugin.deliverNotificationAction(payload);

        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        launch.putExtra("deep_link_message_id", deepLinkMessageId);
        startActivity(launch);
        finish();
    }

    private void onSnoozeClicked() {
        stopAlarmFeedback();

        long snoozeTriggerMs = System.currentTimeMillis() + (10 * 60 * 1000L);
        String snoozeJobId = jobId.isEmpty() ? "snooze-10m" : jobId + "-snooze";
        MeuDiaNativePlugin.scheduleAlarmInternal(
            getApplicationContext(),
            snoozeJobId,
            title,
            body,
            snoozeTriggerMs,
            deepLinkMessageId
        );

        JSObject payload = new JSObject();
        payload.put("action", "snooze_10m");
        payload.put("job_id", jobId);
        payload.put("deep_link_message_id", deepLinkMessageId != null ? deepLinkMessageId : "");
        MeuDiaNativePlugin.deliverNotificationAction(payload);
        finish();
    }

    @Override
    protected void onDestroy() {
        stopAlarmFeedback();
        super.onDestroy();
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
