package com.qilin.chineserecite;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class PlaybackService extends Service implements TextToSpeech.OnInitListener {
    public static final String ACTION_PLAY = "com.qilin.chineserecite.PLAY";
    public static final String ACTION_PLAY_AUDIO = "com.qilin.chineserecite.PLAY_AUDIO";
    public static final String ACTION_STOP = "com.qilin.chineserecite.STOP";
    public static final String EXTRA_LINES = "lines";
    public static final String EXTRA_AUDIO_PATH = "audio_path";
    public static final String EXTRA_AUDIO_TITLE = "audio_title";
    public static final String EXTRA_RATE = "rate";
    public static final String EXTRA_PAUSE = "pause";
    public static final String EXTRA_REPEAT = "repeat";
    public static final String EXTRA_LOOP = "loop";
    public static final String EXTRA_VOICE_STYLE = "voice_style";
    private static final String CHANNEL_ID = "recite_playback";
    private static final int NOTIFICATION_ID = 7007;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private ArrayList<String> lines = new ArrayList<>();
    private int lineIndex;
    private int repeatIndex;
    private int repeat = 1;
    private int pauseMs = 800;
    private boolean loopPlayback;
    private float rate = 0.8f;
    private String voiceStyle = "female";
    private PowerManager.WakeLock wakeLock;
    private MediaPlayer mediaPlayer;
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
            @Override public void onDone(String utteranceId) {
                handler.postDelayed(PlaybackService.this::advance, styledPauseMs());
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_NOT_STICKY;
        if (ACTION_STOP.equals(intent.getAction())) {
            stopPlayback();
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY_AUDIO.equals(intent.getAction())) {
            String path = intent.getStringExtra(EXTRA_AUDIO_PATH);
            String title = intent.getStringExtra(EXTRA_AUDIO_TITLE);
            loopPlayback = intent.getBooleanExtra(EXTRA_LOOP, true);
            if (path == null || path.isEmpty()) {
                stopPlayback();
                return START_NOT_STICKY;
            }
            playAudioFile(path, title);
            return START_NOT_STICKY;
        }
        if (ACTION_PLAY.equals(intent.getAction())) {
            releaseMediaPlayer();
            ArrayList<String> received = intent.getStringArrayListExtra(EXTRA_LINES);
            if (received != null && !received.isEmpty()) {
                lines = received;
                rate = intent.getFloatExtra(EXTRA_RATE, 0.8f);
                pauseMs = intent.getIntExtra(EXTRA_PAUSE, 800);
                repeat = intent.getIntExtra(EXTRA_REPEAT, 1);
                loopPlayback = intent.getBooleanExtra(EXTRA_LOOP, false);
                voiceStyle = intent.getStringExtra(EXTRA_VOICE_STYLE);
                if (!"male".equals(voiceStyle) && !"poetry".equals(voiceStyle) &&
                        !"yunjian".equals(voiceStyle)) voiceStyle = "female";
                lineIndex = 0;
                repeatIndex = 0;
                startForeground(NOTIFICATION_ID, buildNotification("正在准备朗读…"));
                if (!wakeLock.isHeld()) wakeLock.acquire();
                if (ready) {
                    configureVoice();
                    speakCurrent();
                }
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
        tts.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build());
        configureVoice();
        if (!lines.isEmpty()) speakCurrent();
    }

    private void configureVoice() {
        Voice voice = chooseVoice(voiceStyle);
        if (voice != null) tts.setVoice(voice);
        float effectiveRate = rate;
        float pitch = 1.06f;
        if ("male".equals(voiceStyle)) {
            effectiveRate = rate * 0.96f;
            pitch = 0.82f;
        } else if ("yunjian".equals(voiceStyle)) {
            effectiveRate = rate * 0.80f;
            pitch = 0.94f;
        } else if ("poetry".equals(voiceStyle)) {
            effectiveRate = rate * 0.86f;
            pitch = 0.94f;
        }
        tts.setSpeechRate(Math.max(0.5f, Math.min(1.2f, effectiveRate)));
        tts.setPitch(pitch);
    }

    private Voice chooseVoice(String style) {
        Set<Voice> available = tts.getVoices();
        if (available == null || available.isEmpty()) return null;
        List<Voice> chinese = new ArrayList<>();
        for (Voice voice : available) {
            Locale locale = voice.getLocale();
            if (locale == null) continue;
            String language = locale.getLanguage();
            String tag = locale.toLanguageTag().toLowerCase(Locale.ROOT);
            if ("zh".equals(language) || "zho".equals(language) || tag.contains("cmn")) chinese.add(voice);
        }
        if (chinese.isEmpty()) return null;
        chinese.sort(Comparator.comparingInt((Voice voice) -> voiceScore(voice, style)).reversed()
                .thenComparing(Voice::getName));
        boolean maleStyle = "male".equals(style) || "yunjian".equals(style);
        if (maleStyle && !containsGenderMatch(chinese.get(0), "male") && chinese.size() > 1) {
            return chinese.get(1);
        }
        return chinese.get(0);
    }

    private int voiceScore(Voice voice, String style) {
        String name = voice.getName().toLowerCase(Locale.ROOT);
        int score = voice.getQuality();
        if (!voice.isNetworkConnectionRequired()) score += 30;
        if (name.contains("natural") || name.contains("neural") || name.contains("premium")) score += 500;
        if ("yunjian".equals(style) && (name.contains("yunjian") || name.contains("云健"))) score += 3000;
        if (("male".equals(style) || "yunjian".equals(style)) && containsGenderMatch(voice, "male")) score += 1000;
        if (("female".equals(style) || "poetry".equals(style)) && containsGenderMatch(voice, "female")) score += 1000;
        return score;
    }

    private boolean containsGenderMatch(Voice voice, String gender) {
        String name = voice.getName().toLowerCase(Locale.ROOT);
        if ("male".equals(gender)) {
            return name.matches(".*(male|man|boy|yunxi|yunyang|yunjian|kangkang|gang|liang).*");
        }
        return name.matches(".*(female|woman|girl|xiaoxiao|xiaoyi|tingting|yaoyao|huihui|meimei|zhiyu).*");
    }

    private int styledPauseMs() {
        if ("yunjian".equals(voiceStyle)) return 0;
        return "poetry".equals(voiceStyle) ? Math.max(1200, pauseMs) : pauseMs;
    }

    private void playAudioFile(String path, String title) {
        handler.removeCallbacksAndMessages(null);
        if (tts != null) tts.stop();
        releaseMediaPlayer();
        startForeground(NOTIFICATION_ID, buildNotification("正在播放 MP3：" + (title == null ? "背诵音频" : title)));
        if (!wakeLock.isHeld()) wakeLock.acquire();
        try {
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build());
            mediaPlayer.setDataSource(path);
            mediaPlayer.setLooping(loopPlayback);
            mediaPlayer.setOnPreparedListener(MediaPlayer::start);
            mediaPlayer.setOnCompletionListener(player -> stopPlayback());
            mediaPlayer.setOnErrorListener((player, what, extra) -> {
                stopPlayback();
                return true;
            });
            mediaPlayer.prepareAsync();
        } catch (Exception error) {
            stopPlayback();
        }
    }

    private void releaseMediaPlayer() {
        if (mediaPlayer == null) return;
        try {
            if (mediaPlayer.isPlaying()) mediaPlayer.stop();
        } catch (IllegalStateException ignored) {
        }
        mediaPlayer.reset();
        mediaPlayer.release();
        mediaPlayer = null;
    }

    private void speakCurrent() {
        if (!ready || lines.isEmpty()) {
            stopPlayback();
            return;
        }
        if (lineIndex >= lines.size()) {
            if (!loopPlayback) {
                stopPlayback();
                return;
            }
            lineIndex = 0;
            repeatIndex = 0;
        }
        String line = lines.get(lineIndex);
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
        releaseMediaPlayer();
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
        releaseMediaPlayer();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
