package com.meudia.app;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    private static final Pattern URL_PATTERN = Pattern.compile("https?://[^\\s<>\"')]+", Pattern.CASE_INSENSITIVE);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MeuDiaNativePlugin.class);
        super.onCreate(savedInstanceState);
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        String deepLinkMsgId = intent.getStringExtra("deep_link_message_id");
        if (deepLinkMsgId != null && !deepLinkMsgId.isEmpty()) {
            JSObject actionPayload = new JSObject();
            actionPayload.put("action", "open");
            actionPayload.put("deep_link_message_id", deepLinkMsgId);
            MeuDiaNativePlugin.deliverNotificationAction(actionPayload);
        }

        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        String mime = intent.getType();
        if (mime == null) return;

        if ("text/plain".equals(mime)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            String sharedSubject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (sharedText == null || sharedText.trim().isEmpty()) return;

            JSObject payload = new JSObject();
            Matcher matcher = URL_PATTERN.matcher(sharedText);
            if (matcher.find()) {
                payload.put("kind", "link");
                payload.put("url", matcher.group());
                payload.put("title", sharedSubject != null ? sharedSubject : "Link compartilhado");
                payload.put("text", sharedText);
            } else {
                payload.put("kind", "text");
                payload.put("title", sharedSubject);
                payload.put("text", sharedText);
            }
            payload.put("mime_type", mime);
            MeuDiaNativePlugin.deliverSharePayload(payload);
            return;
        }

        if (mime.startsWith("image/")) {
            Uri imageUri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (imageUri == null) return;
            String base64 = readImageAsBase64(imageUri);
            if (base64 == null) return;

            JSObject payload = new JSObject();
            payload.put("kind", "image");
            payload.put("title", intent.getStringExtra(Intent.EXTRA_SUBJECT));
            payload.put("mime_type", "image/jpeg");
            payload.put("image_base64", base64);
            MeuDiaNativePlugin.deliverSharePayload(payload);
        }
    }

    private String readImageAsBase64(Uri uri) {
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) return null;
            Bitmap decoded = BitmapFactory.decodeStream(stream);
            if (decoded == null) return null;

            int maxDim = 1440;
            int w = decoded.getWidth();
            int h = decoded.getHeight();
            Bitmap scaled = decoded;
            if (w > maxDim || h > maxDim) {
                float ratio = Math.min((float) maxDim / w, (float) maxDim / h);
                scaled = Bitmap.createScaledBitmap(
                    decoded,
                    Math.max(1, Math.round(w * ratio)),
                    Math.max(1, Math.round(h * ratio)),
                    true
                );
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            scaled.compress(Bitmap.CompressFormat.JPEG, 76, out);
            return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception ignored) {
            return null;
        }
    }
}
