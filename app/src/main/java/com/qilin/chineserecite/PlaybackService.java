package com.qilin.chineserecite;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import java.util.ArrayList;
import java.util.Locale;

public class PlaybackService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_PLAY = "com.qilin.chineserecite.PLAY";
    public static final String ACTION_STOP = "com.qilin.chineserecite.STOP";
    public static final String EXTRA_LINES = "lines";
    public static final String EXTRA_RATE = "rate";
    public static final String EXTRA_PAUSE = "pause";
    public static final String EXTRA_REPEAT = "repeat";
    private static final String CHANNEL_ID = "recite_playback";
    private static final int NOTIFICATION_ID = 7007;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private ArrayList<String> lines = new ArrayList<>();
    private int lineIndex;
    private int repeatIndex;
    private int repeat = 1;
    private int pauseMs = 800;
    private float rate = 0.8f;
    private PowerManager.WakeLock wakeLock;
    private boolean ready;

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChineseRecite:Playback");
        tts = new TextToSpeech(this, this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) {}
            @Override public void onError(String utteranceId) { handler.post(PlaybackService.this::advance); }
            @Override public void onDone(String utteranceId) { handler.postDelayed(PlaybackService.this::advance, pauseMs); }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        if (ACTION_STOP.equals(intent.getAction())) {
            stopPlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(intent.getAction())) {
            ArrayList<String> received = intent.getStringArrayListExtra(EXTRA_LINES);
            if (received != null && !received.isEmpty()) {
                lines = received;
                rate = intent.getFloatExtra(EXTRA_RATE, 0.8f);
                pauseMs = intent.getIntExtra(EXTRA_PAUSE, 800);
                repeat = intent.getIntExtra(EXTRA_REPEAT, 1);
                lineIndex = 0;
                repeatIndex = 0;
                startForeground(NOTIFICATION_ID, buildNotification("正在准备朗读…"));
                if (!wakeLock.isHeld()) wakeLock.acquire(60 * 60 * 1000L);
                if (ready) speakCurrent();
            }
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        if (!ready) {
            stopPlayback();
            return;
        }
        tts.setLanguage(Locale.SIMPLIFIED_CHINESE);
        tts.setSpeechRate(rate);
        if (!lines.isEmpty()) speakCurrent();
    }

    private void speakCurrent() {
        if (!ready || lineIndex >= lines.size()) {
            stopPlayback();
            return;
        }
        String line = lines.get(lineIndex);
        tts.setSpeechRate(rate);
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification("第 " + (lineIndex + 1) + " / " + lines.size() + " 句"));
        tts.speak(line, TextToSpeech.QUEUE_FLUSH, null,
                "line-" + lineIndex + "-" + repeatIndex + "-" + System.nanoTime());
    }

    private void advance() {
        repeatIndex++;
        if (repeatIndex >= repeat) {
            repeatIndex = 0;
            lineIndex++;
        }
        speakCurrent();
    }

    private Notification buildNotification(String status) {
        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent open = PendingIntent.getActivity(this, 1, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent stopIntent = new Intent(this, PlaybackService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stop = PendingIntent.getService(this, 2, stopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder
                .setSmallIcon(com.qilin.chineserecite.R.drawable.ic_launcher)
                .setContentTitle("文绮语文背诵")
                .setContentText(status)
                .setContentIntent(open)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .addAction(new Notification.Action.Builder(
                        android.R.drawable.ic_media_pause, "停止", stop).build())
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, getString(R.string.playback_channel), NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(getString(R.string.playback_channel_description));
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(channel);
        }
    }

    private void stopPlayback() {
        handler.removeCallbacksAndMessages(null);
        if (tts != null) tts.stop();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacksAndMessages(null);
        if (tts != null) {
            tts.stop();
            tts.shutdown();
        }
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
