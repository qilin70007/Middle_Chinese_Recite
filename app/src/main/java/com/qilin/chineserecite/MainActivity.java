package com.qilin.chineserecite;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
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

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;

public class MainActivity extends Activity {
    private static final int CREATE_BACKUP = 4101;
    private static final int FILE_CHOOSER = 4102;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private String pendingFileContent;
    private boolean playbackReceiverRegistered;
    private final BroadcastReceiver playbackReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (webView == null || !PlaybackService.ACTION_PROGRESS.equals(intent.getAction())) return;
            int index = intent.getIntExtra(PlaybackService.EXTRA_INDEX, -1);
            int total = intent.getIntExtra(PlaybackService.EXTRA_TOTAL, 0);
            boolean done = intent.getBooleanExtra(PlaybackService.EXTRA_DONE, false);
            String script = "window.dispatchEvent(new CustomEvent('nativeSpeechProgress',{" +
                    "detail:{index:" + index + ",total:" + total + ",done:" + done + "}}))";
            webView.post(() -> webView.evaluateJavascript(script, null));
        }
    };

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

        IntentFilter playbackFilter = new IntentFilter(PlaybackService.ACTION_PROGRESS);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(playbackReceiver, playbackFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(playbackReceiver, playbackFilter);
        }
        playbackReceiverRegistered = true;

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 33);
        }
    }

    public final class AndroidBridge {
        @JavascriptInterface
        public void startPlayback(String jsonLines, double rate, int pauseMs, int repeat) {
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
        if (playbackReceiverRegistered) {
            try {
                unregisterReceiver(playbackReceiver);
            } catch (IllegalArgumentException ignored) {
            }
            playbackReceiverRegistered = false;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("Native");
            webView.destroy();
        }
        super.onDestroy();
    }
}
