package com.qilin.chineserecite;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int CREATE_BACKUP = 4101;
    private static final int FILE_CHOOSER = 4102;
    private static final int PICK_AUDIO = 4103;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingFileContent;
    private String pendingAudioLessonId;

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.rgb(246, 242, 232));
        window.setNavigationBarColor(Color.WHITE);

        webView = new WebView(this);
        setContentView(webView);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setDefaultTextEncodingName("utf-8");
        settings.setBuiltInZoomControls(false);
        webView.addJavascriptInterface(new AndroidBridge(), "Native");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER);
                    return true;
                } catch (Exception error) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "无法打开文件选择器", Toast.LENGTH_SHORT).show();
                    return false;
                }
            }
        });
        webView.loadUrl("file:///android_asset/www/index.html");

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 33);
        }
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void startPlayback(String jsonLines, double rate, int pauseMs, int repeat, String voiceStyle, boolean loopPlayback) {
            try {
                JSONArray array = new JSONArray(jsonLines);
                ArrayList<String> lines = new ArrayList<>();
                for (int i = 0; i < array.length(); i++) {
                    String line = array.optString(i, "").trim();
                    if (!line.isEmpty()) lines.add(line);
                }
                if (lines.isEmpty()) return;
                Intent intent = new Intent(MainActivity.this, PlaybackService.class);
                intent.setAction(PlaybackService.ACTION_PLAY);
                intent.putStringArrayListExtra(PlaybackService.EXTRA_LINES, lines);
                intent.putExtra(PlaybackService.EXTRA_RATE, (float) Math.max(0.5, Math.min(1.4, rate)));
                intent.putExtra(PlaybackService.EXTRA_PAUSE, Math.max(0, Math.min(5000, pauseMs)));
                intent.putExtra(PlaybackService.EXTRA_REPEAT, Math.max(1, Math.min(5, repeat)));
                intent.putExtra(PlaybackService.EXTRA_LOOP, loopPlayback);
                String style = "male".equals(voiceStyle) || "poetry".equals(voiceStyle) ||
                        "yunjian".equals(voiceStyle) ? voiceStyle : "female";
                intent.putExtra(PlaybackService.EXTRA_VOICE_STYLE, style);
                if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent); else startService(intent);
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "已开始朗读，息屏后仍会继续", Toast.LENGTH_SHORT).show());
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this,
                        "朗读内容无法识别", Toast.LENGTH_SHORT).show());
            }
        }

        @JavascriptInterface
        public void stopPlayback() {
            Intent intent = new Intent(MainActivity.this, PlaybackService.class);
            intent.setAction(PlaybackService.ACTION_STOP);
            startService(intent);
        }

        @JavascriptInterface
        public void pickAudio(String lessonId) {
            pendingAudioLessonId = lessonId;
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("audio/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            runOnUiThread(() -> startActivityForResult(intent, PICK_AUDIO));
        }

        @JavascriptInterface
        public boolean hasImportedAudio(String lessonId) {
            return audioFileForLesson(lessonId).isFile();
        }

        @JavascriptInterface
        public boolean playImportedAudio(String lessonId, String title) {
            File audio = audioFileForLesson(lessonId);
            if (!audio.isFile()) return false;
            Intent intent = new Intent(MainActivity.this, PlaybackService.class);
            intent.setAction(PlaybackService.ACTION_PLAY_AUDIO);
            intent.putExtra(PlaybackService.EXTRA_AUDIO_PATH, audio.getAbsolutePath());
            intent.putExtra(PlaybackService.EXTRA_AUDIO_TITLE, title == null ? "背诵音频" : title);
            intent.putExtra(PlaybackService.EXTRA_LOOP, true);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent); else startService(intent);
            return true;
        }

        @JavascriptInterface
        public boolean removeImportedAudio(String lessonId) {
            File audio = audioFileForLesson(lessonId);
            return !audio.exists() || audio.delete();
        }

        @JavascriptInterface
        public void saveTextFile(String filename, String content) {
            pendingFileContent = content;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            runOnUiThread(() -> startActivityForResult(intent, CREATE_BACKUP));
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public void openTtsSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent("com.android.settings.TTS_SETTINGS"));
                } catch (Exception ignored) {
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
                }
            });
        }
    }

    private File audioFileForLesson(String lessonId) {
        String safeId = lessonId == null ? "unknown" : lessonId.replaceAll("[^a-zA-Z0-9_-]", "_");
        File directory = new File(getFilesDir(), "lesson_audio");
        if (!directory.exists()) directory.mkdirs();
        return new File(directory, safeId + ".mp3");
    }

    private String getDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri,
                new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
        }
        return "已导入的音频.mp3";
    }

    private void notifyAudioImported(String lessonId, String displayName) {
        if (webView == null) return;
        String script = "window.onNativeAudioImported && window.onNativeAudioImported("
                + JSONObject.quote(lessonId) + "," + JSONObject.quote(displayName) + ")";
        webView.evaluateJavascript(script, null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER) {
            if (fileCallback != null) {
                Uri[] result = resultCode == RESULT_OK && data != null && data.getData() != null
                        ? new Uri[]{data.getData()} : null;
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        if (requestCode == PICK_AUDIO) {
            String lessonId = pendingAudioLessonId;
            pendingAudioLessonId = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && lessonId != null) {
                Uri uri = data.getData();
                File destination = audioFileForLesson(lessonId);
                File temporary = new File(destination.getParentFile(), destination.getName() + ".tmp");
                try (InputStream input = getContentResolver().openInputStream(uri);
                     FileOutputStream output = new FileOutputStream(temporary)) {
                    if (input == null) throw new IllegalStateException("无法读取音频");
                    byte[] buffer = new byte[16 * 1024];
                    int length;
                    while ((length = input.read(buffer)) > 0) output.write(buffer, 0, length);
                    if (destination.exists() && !destination.delete()) throw new IllegalStateException("无法替换原音频");
                    if (!temporary.renameTo(destination)) throw new IllegalStateException("无法保存音频");
                    notifyAudioImported(lessonId, getDisplayName(uri));
                    Toast.makeText(this, "MP3 已导入", Toast.LENGTH_SHORT).show();
                } catch (Exception error) {
                    if (temporary.exists()) temporary.delete();
                    Toast.makeText(this, "导入失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
            return;
        }
        if (requestCode == CREATE_BACKUP && resultCode == RESULT_OK && data != null && data.getData() != null) {
            try (OutputStream output = getContentResolver().openOutputStream(data.getData())) {
                if (output != null) {
                    output.write(pendingFileContent.getBytes(StandardCharsets.UTF_8));
                    Toast.makeText(this, "备份已保存", Toast.LENGTH_SHORT).show();
                }
            } catch (Exception error) {
                Toast.makeText(this, "保存失败：" + error.getMessage(), Toast.LENGTH_LONG).show();
            } finally {
                pendingFileContent = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("(window.appBack && window.appBack())", handled -> {
            if (!"true".equals(handled)) MainActivity.super.onBackPressed();
        });
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.removeJavascriptInterface("Native");
            webView.destroy();
        }
        super.onDestroy();
    }
}
