package com.cricapp.live.floatingwidget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.cricapp.live.MainActivity;
import com.cricapp.live.R;

import java.util.Locale;
import java.util.Set;

/**
 * v1.0.16 (2026-05-06) — Floating Scoreboard overhaul per user directive:
 *   • All sizes (text + paddings) reduced ~30% so the widget is more
 *     compact on screen but no information is hidden / clipped.
 *   • Background opacity is UNCHANGED.
 *   • Only the BATTING team's score row is rendered. The non-batting
 *     team's row is hidden until they come out to bat (then the React
 *     side flips `battingTeam` and we swap which row is visible).
 *   • Bowler row shows: bowler name + ball-by-ball of the CURRENT over
 *     only (no previous-over balls).
 *   • React side pushes UPDATE_SCORE every 30s via auto-refresh, so the
 *     widget never goes stale.
 */
public class FloatingWidgetService extends Service implements TextToSpeech.OnInitListener {
    private static final String CHANNEL_ID = "floating_widget_channel";
    private static final int NOTIFICATION_ID = 1001;

    private WindowManager windowManager;
    private View floatingView;
    private boolean isMinimized = false;

    // v1.0.16 Rev 7 — DIRECT references to the team rows. We learnt
    // (build #125, user screenshot 2026-05-06 showing both rows still
    // visible) that `findViewWithTag` based hiding wasn't taking
    // effect reliably in production. Holding direct LinearLayout
    // references and toggling visibility on them is bullet-proof.
    private LinearLayout team1RowView;
    private LinearLayout team2RowView;
    private TextView overBallsView;

    private TextToSpeech tts;
    private boolean isTTSReady = false;
    private boolean isMuted = false;
    private String lastSpokenCommentary = "";
    private TextView muteButton;

    private static String team1Name = "TM1";
    private static String team2Name = "TM2";
    private static String team1Score = "-";
    private static String team2Score = "-";
    private static String team1Overs = "";
    private static String team2Overs = "";
    private static String statusText = "";
    private static String batsmanName = "";
    private static String bowlerName = "";
    private static String commentary = "";
    // v1.0.16 — only render the batting team's row. Default 'team1' so
    // the widget shows team1 if the React side hasn't flipped yet.
    private static String battingTeam = "team1";
    private static String bowlerOverBalls = "";
    // v1.0.16 Rev 4 — voice prefs forwarded from CommentarySection picker.
    //   • voiceLanguage: "en-IN" or "hi-IN".
    //   • commentaryHindi: editorial Hindi text for current ball.
    //     Only spoken when voiceLanguage="hi-IN" AND this string is
    //     non-empty (Devanagari-validated upstream).
    //   • voiceRate / voicePitch: tuned for "Excited" mode (1.15 / 1.05).
    private static String voiceLanguage = "en-IN";
    private static String commentaryHindi = "";
    private static float voiceRate = 0.9f;
    private static float voicePitch = 0.85f;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        tts = new TextToSpeech(this, this);
        createFloatingWidget();
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            int result = tts.setLanguage(Locale.US);
            if (result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED) {
                isTTSReady = true;
                tts.setSpeechRate(0.9f);
                tts.setPitch(0.85f);
                try {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null) {
                        for (Voice voice : voices) {
                            String voiceName = voice.getName().toLowerCase();
                            if (voiceName.contains("male") || voiceName.contains("en-us-x-sfg") ||
                                voiceName.contains("en-in") || voiceName.contains("james")) {
                                tts.setVoice(voice);
                                break;
                            }
                        }
                    }
                } catch (Exception e) {}
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("UPDATE_SCORE".equals(action)) {
                team1Name = intent.getStringExtra("team1Name") != null ? intent.getStringExtra("team1Name") : team1Name;
                team2Name = intent.getStringExtra("team2Name") != null ? intent.getStringExtra("team2Name") : team2Name;
                team1Score = intent.getStringExtra("team1Score") != null ? intent.getStringExtra("team1Score") : team1Score;
                team2Score = intent.getStringExtra("team2Score") != null ? intent.getStringExtra("team2Score") : team2Score;
                team1Overs = intent.getStringExtra("team1Overs") != null ? intent.getStringExtra("team1Overs") : team1Overs;
                team2Overs = intent.getStringExtra("team2Overs") != null ? intent.getStringExtra("team2Overs") : team2Overs;
                statusText = intent.getStringExtra("statusText") != null ? intent.getStringExtra("statusText") : statusText;
                batsmanName = intent.getStringExtra("batsmanName") != null ? intent.getStringExtra("batsmanName") : batsmanName;
                bowlerName = intent.getStringExtra("bowlerName") != null ? intent.getStringExtra("bowlerName") : bowlerName;
                if (intent.getStringExtra("battingTeam") != null) {
                    battingTeam = intent.getStringExtra("battingTeam");
                }
                if (intent.getStringExtra("bowlerOverBalls") != null) {
                    bowlerOverBalls = intent.getStringExtra("bowlerOverBalls");
                }
                // v1.0.16 Rev 4 — voice prefs
                if (intent.getStringExtra("voiceLanguage") != null) {
                    String newLang = intent.getStringExtra("voiceLanguage");
                    if (!newLang.equals(voiceLanguage)) {
                        voiceLanguage = newLang;
                        applyTtsLocale();
                        // Reset dedup so the next ball speaks in the new language
                        lastSpokenCommentary = "";
                    }
                }
                if (intent.getStringExtra("commentaryHindi") != null) {
                    commentaryHindi = intent.getStringExtra("commentaryHindi");
                }
                if (intent.hasExtra("voiceMuted")) {
                    boolean nextMuted = intent.getBooleanExtra("voiceMuted", isMuted);
                    if (nextMuted != isMuted) {
                        isMuted = nextMuted;
                        if (isMuted && tts != null && tts.isSpeaking()) tts.stop();
                        updateMuteButton();
                    }
                }
                if (intent.hasExtra("voiceRate")) {
                    voiceRate = intent.getFloatExtra("voiceRate", voiceRate);
                    if (tts != null) tts.setSpeechRate(voiceRate);
                }
                if (intent.hasExtra("voicePitch")) {
                    voicePitch = intent.getFloatExtra("voicePitch", voicePitch);
                    if (tts != null) tts.setPitch(voicePitch);
                }

                String newCommentary = intent.getStringExtra("commentary");
                if (newCommentary != null && !newCommentary.isEmpty()) {
                    commentary = newCommentary;
                }
                // Decide what (if anything) to speak based on language.
                String spokenText = pickSpokenText();
                if (spokenText != null && !spokenText.isEmpty() && !spokenText.equals(lastSpokenCommentary)) {
                    speakCommentary(spokenText);
                    lastSpokenCommentary = spokenText;
                }

                updateFloatingWidget();
            } else if ("STOP_WIDGET".equals(action)) {
                stopSelf();
            } else if ("TOGGLE_MUTE".equals(action)) {
                toggleMute();
            }
        }
        return START_STICKY;
    }

    /**
     * v1.0.16 Rev 4 — pick the text to speak based on voice language.
     * Hindi mode is STRICT: we only speak when commentaryHindi is set
     * (Devanagari-validated upstream). NEVER fall back to English in
     * Hindi mode — that was the v1.0.15 pronunciation bug.
     */
    private String pickSpokenText() {
        if ("hi-IN".equals(voiceLanguage)) {
            if (commentaryHindi != null && !commentaryHindi.isEmpty()) {
                return commentaryHindi;
            }
            return null; // silence > broken pronunciation
        }
        return commentary;
    }

    /**
     * Re-apply the TTS Locale based on the current voiceLanguage. Picks
     * Hindi-IN when available, falls back to US English otherwise.
     */
    private void applyTtsLocale() {
        if (tts == null || !isTTSReady) return;
        try {
            Locale target = "hi-IN".equals(voiceLanguage)
                ? new Locale("hi", "IN")
                : Locale.US;
            int result = tts.setLanguage(target);
            if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                // Hindi voice pack not installed on device — silently
                // revert to English so we don't crash the speak() call.
                tts.setLanguage(Locale.US);
                voiceLanguage = "en-IN";
            }
        } catch (Exception e) {}
    }

    private void speakCommentary(String text) {
        if (isTTSReady && !isMuted && text != null && !text.isEmpty()) {
            if (tts.isSpeaking()) {
                tts.stop();
            }
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "commentary_" + System.currentTimeMillis());
        }
    }

    private void toggleMute() {
        isMuted = !isMuted;
        if (isMuted && tts != null && tts.isSpeaking()) {
            tts.stop();
        }
        updateMuteButton();
    }

    private void updateMuteButton() {
        if (muteButton != null) {
            muteButton.post(() -> {
                muteButton.setText(isMuted ? "\uD83D\uDD07" : "\uD83D\uDD0A");
                android.graphics.drawable.GradientDrawable muteBg = new android.graphics.drawable.GradientDrawable();
                muteBg.setColor(isMuted ? 0x50FF4444 : 0x5044BB44);
                muteBg.setCornerRadius(10f);
                muteButton.setBackground(muteBg);
            });
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Floating Score Widget",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Shows live cricket score as floating widget");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent,
            PendingIntent.FLAG_IMMUTABLE
        );

        // Notification only mentions the batting team — same UX
        // principle as the floating overlay.
        String battingName = "team2".equals(battingTeam) ? team2Name : team1Name;
        String battingScore = "team2".equals(battingTeam) ? team2Score : team1Score;
        String waitingName = "team2".equals(battingTeam) ? team1Name : team2Name;

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CricApp Live Score")
            .setContentText(battingName + " " + battingScore + " vs " + waitingName)
            .setSmallIcon(R.drawable.notification_icon)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }

    private void createFloatingWidget() {
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);
        floatingView = createFloatingViewProgrammatically();

        int layoutType;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            layoutType = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
        } else {
            layoutType = WindowManager.LayoutParams.TYPE_PHONE;
        }

        final WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        );

        params.gravity = Gravity.TOP | Gravity.END;
        params.x = 14;
        params.y = 105;

        floatingView.setOnTouchListener(new View.OnTouchListener() {
            private int initialX, initialY;
            private float initialTouchX, initialTouchY;
            private long startClickTime;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = params.x;
                        initialY = params.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        startClickTime = System.currentTimeMillis();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        params.x = initialX - (int) (event.getRawX() - initialTouchX);
                        params.y = initialY + (int) (event.getRawY() - initialTouchY);
                        windowManager.updateViewLayout(floatingView, params);
                        return true;

                    case MotionEvent.ACTION_UP:
                        long clickDuration = System.currentTimeMillis() - startClickTime;
                        if (clickDuration < 200) {
                            toggleMinimize(params);
                        }
                        return true;
                }
                return false;
            }
        });

        windowManager.addView(floatingView, params);
        updateFloatingWidget();
    }

    private View createFloatingViewProgrammatically() {
        Context context = this;

        // v1.0.16 — paddings reduced ~30% from previous (32,20 → 22,14).
        // Background opacity 0x70000000 unchanged per user spec.
        LinearLayout mainLayout = new LinearLayout(context);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setPadding(22, 14, 22, 14);

        android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
        background.setColor(0x70000000);
        background.setCornerRadius(22f);
        background.setStroke(2, 0x804CAF50);
        mainLayout.setBackground(background);

        // ============= Header =============
        LinearLayout headerLayout = new LinearLayout(context);
        headerLayout.setOrientation(LinearLayout.HORIZONTAL);
        headerLayout.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.setMargins(0, 0, 0, 11);
        headerLayout.setLayoutParams(headerParams);

        TextView liveBadge = new TextView(context);
        liveBadge.setText("● LIVE");
        liveBadge.setTextColor(0xFFFFFFFF);
        liveBadge.setTextSize(7);
        liveBadge.setTypeface(null, android.graphics.Typeface.BOLD);
        liveBadge.setPadding(10, 3, 10, 3);
        android.graphics.drawable.GradientDrawable liveBg = new android.graphics.drawable.GradientDrawable();
        liveBg.setColor(0xCCFF4444);
        liveBg.setCornerRadius(10f);
        liveBadge.setBackground(liveBg);

        muteButton = new TextView(context);
        muteButton.setText("\uD83D\uDD0A");
        muteButton.setTextSize(11);
        muteButton.setPadding(10, 4, 10, 4);
        muteButton.setGravity(Gravity.CENTER);
        android.graphics.drawable.GradientDrawable muteBg = new android.graphics.drawable.GradientDrawable();
        muteBg.setColor(0x5044BB44);
        muteBg.setCornerRadius(10f);
        muteButton.setBackground(muteBg);
        muteButton.setOnClickListener(v -> toggleMute());

        // v1.0.16 — FAKE refresh button.
        // Pure visual placebo per user directive (2026-05-06 revision):
        //   "Yeh refresh ka logic jo humne user ko bewakoof banane k
        //    liye rakha h yeh floating scoreboard par bhi hona chahiye,
        //    jo actually koi data refresh na kare na hi API call kare.
        //    Yeh scoreboard par refresh karne k clicks count na ho ,
        //    kuki user time pro user hoga."
        //
        // - No data fetch.
        // - No click-counter increment (Pro users see this overlay
        //   and Pro users DO NOT see interstitials anyway).
        // - 30s automatic refresh (driven by the React side via
        //   UPDATE_SCORE intents) is the only real source of fresh data.
        TextView refreshButton = new TextView(context);
        refreshButton.setText("\uD83D\uDD04"); // 🔄
        refreshButton.setTextSize(11);
        refreshButton.setPadding(10, 4, 10, 4);
        refreshButton.setGravity(Gravity.CENTER);
        android.graphics.drawable.GradientDrawable refreshBg = new android.graphics.drawable.GradientDrawable();
        refreshBg.setColor(0x502196F3);
        refreshBg.setCornerRadius(10f);
        refreshButton.setBackground(refreshBg);
        refreshButton.setOnClickListener(v -> {
            // Visual-only feedback: brief rotate + background flash.
            // Intentionally NOT calling updateFloatingWidget() or any
            // intent — refresh is fake.
            try {
                v.animate().rotationBy(360f).setDuration(700).start();
                final android.graphics.drawable.GradientDrawable activeBg = new android.graphics.drawable.GradientDrawable();
                activeBg.setColor(0xCC2196F3);
                activeBg.setCornerRadius(10f);
                v.setBackground(activeBg);
                v.postDelayed(() -> {
                    final android.graphics.drawable.GradientDrawable idleBg = new android.graphics.drawable.GradientDrawable();
                    idleBg.setColor(0x502196F3);
                    idleBg.setCornerRadius(10f);
                    v.setBackground(idleBg);
                }, 700);
            } catch (Exception e) {}
        });

        TextView dragIndicator = new TextView(context);
        dragIndicator.setText("⋮⋮");
        dragIndicator.setTextColor(0xAAFFFFFF);
        dragIndicator.setTextSize(10);
        dragIndicator.setPadding(7, 0, 7, 0);
        dragIndicator.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        dragIndicator.setGravity(Gravity.CENTER);

        TextView closeBtn = new TextView(context);
        closeBtn.setText("✕");
        closeBtn.setTextColor(0xFFFFFFFF);
        closeBtn.setTextSize(11);
        closeBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        closeBtn.setPadding(11, 5, 11, 5);
        android.graphics.drawable.GradientDrawable closeBg = new android.graphics.drawable.GradientDrawable();
        closeBg.setColor(0x50FF4444);
        closeBg.setCornerRadius(10f);
        closeBtn.setBackground(closeBg);
        closeBtn.setOnClickListener(v -> stopSelf());

        headerLayout.addView(liveBadge);
        headerLayout.addView(muteButton);
        headerLayout.addView(refreshButton);
        headerLayout.addView(dragIndicator);
        headerLayout.addView(closeBtn);
        mainLayout.addView(headerLayout);

        // v1.0.16 Rev 7 — direct references guarantee row hide works.
        // Assigning into the service fields after creation lets
        // updateFloatingWidget() / toggleMinimize() bypass the
        // findViewWithTag traversal entirely.
        team1RowView = createTeamRow(context, "team1");
        team2RowView = createTeamRow(context, "team2");
        mainLayout.addView(team1RowView);
        mainLayout.addView(team2RowView);

        // ============= Status =============
        TextView statusView = new TextView(context);
        statusView.setTag("statusText");
        statusView.setTextColor(0xFFFFD700);
        statusView.setTextSize(8);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(0, 10, 0, 4);
        statusView.setShadowLayer(2f, 1f, 1f, 0x99000000);
        mainLayout.addView(statusView);

        // ============= Player row (batsman vs bowler) =============
        LinearLayout playerLayout = new LinearLayout(context);
        playerLayout.setOrientation(LinearLayout.HORIZONTAL);
        playerLayout.setGravity(Gravity.CENTER);
        playerLayout.setPadding(0, 4, 0, 0);

        TextView batsmanView = new TextView(context);
        batsmanView.setTag("batsmanName");
        batsmanView.setTextColor(0xFF66FF66);
        batsmanView.setTextSize(8);
        batsmanView.setShadowLayer(2f, 1f, 1f, 0x99000000);

        TextView vsView = new TextView(context);
        vsView.setText("  vs  ");
        vsView.setTextColor(0xFFCCCCCC);
        vsView.setTextSize(8);

        TextView bowlerView = new TextView(context);
        bowlerView.setTag("bowlerName");
        bowlerView.setTextColor(0xFF66B3FF);
        bowlerView.setTextSize(8);
        bowlerView.setShadowLayer(2f, 1f, 1f, 0x99000000);

        playerLayout.addView(batsmanView);
        playerLayout.addView(vsView);
        playerLayout.addView(bowlerView);
        mainLayout.addView(playerLayout);

        // v1.0.16 Rev 7 — current-over balls strip ("This over: 1 4 . . W").
        // Now uses an instance field so updateFloatingWidget can update
        // it without re-traversing the view tree, and so we can ALWAYS
        // make it visible (even if empty we'll write a placeholder).
        overBallsView = new TextView(context);
        overBallsView.setTag("bowlerOverBalls");
        overBallsView.setTextColor(0xFFFFFFFF);
        overBallsView.setTextSize(11);
        overBallsView.setTypeface(null, android.graphics.Typeface.BOLD);
        overBallsView.setGravity(Gravity.CENTER);
        overBallsView.setPadding(0, 6, 0, 0);
        overBallsView.setShadowLayer(2f, 1f, 1f, 0x99000000);
        mainLayout.addView(overBallsView);

        TextView hintView = new TextView(context);
        hintView.setText("Tap to minimize • Drag to move");
        hintView.setTextColor(0xAAFFFFFF);
        hintView.setTextSize(6);
        hintView.setGravity(Gravity.CENTER);
        hintView.setPadding(0, 7, 0, 0);
        mainLayout.addView(hintView);

        return mainLayout;
    }

    private LinearLayout createTeamRow(Context context, String tag) {
        LinearLayout rowLayout = new LinearLayout(context);
        rowLayout.setTag(tag + "Row"); // v1.0.16 — needed to toggle visibility
        rowLayout.setOrientation(LinearLayout.HORIZONTAL);
        rowLayout.setGravity(Gravity.CENTER_VERTICAL);
        rowLayout.setPadding(14, 10, 14, 10);

        android.graphics.drawable.GradientDrawable rowBg = new android.graphics.drawable.GradientDrawable();
        rowBg.setColor(0x30FFFFFF);
        rowBg.setCornerRadius(10f);
        rowLayout.setBackground(rowBg);

        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowParams.setMargins(0, 4, 0, 4);
        rowLayout.setLayoutParams(rowParams);

        TextView teamName = new TextView(context);
        teamName.setTag(tag + "Name");
        teamName.setTextColor(0xFFFFFFFF);
        teamName.setTextSize(12);
        teamName.setTypeface(null, android.graphics.Typeface.BOLD);
        teamName.setMinWidth(64);
        teamName.setShadowLayer(2f, 1f, 1f, 0x99000000);

        TextView score = new TextView(context);
        score.setTag(tag + "Score");
        score.setTextColor(0xFF4AE54A);
        score.setTextSize(17);
        score.setTypeface(null, android.graphics.Typeface.BOLD);
        score.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        score.setGravity(Gravity.END);
        score.setShadowLayer(2f, 1f, 1f, 0x99000000);

        TextView overs = new TextView(context);
        overs.setTag(tag + "Overs");
        overs.setTextColor(0xFFE0E0E0);
        overs.setTextSize(9);
        overs.setPadding(10, 0, 0, 0);
        overs.setMinWidth(50);
        overs.setGravity(Gravity.END);
        overs.setShadowLayer(2f, 1f, 1f, 0x99000000);

        rowLayout.addView(teamName);
        rowLayout.addView(score);
        rowLayout.addView(overs);

        return rowLayout;
    }

    private void updateFloatingWidget() {
        if (floatingView == null) return;

        TextView t1Name = floatingView.findViewWithTag("team1Name");
        TextView t2Name = floatingView.findViewWithTag("team2Name");
        TextView t1Score = floatingView.findViewWithTag("team1Score");
        TextView t2Score = floatingView.findViewWithTag("team2Score");
        TextView t1Overs = floatingView.findViewWithTag("team1Overs");
        TextView t2Overs = floatingView.findViewWithTag("team2Overs");
        TextView status = floatingView.findViewWithTag("statusText");
        TextView batsman = floatingView.findViewWithTag("batsmanName");
        TextView bowler = floatingView.findViewWithTag("bowlerName");

        // v1.0.16 Rev 7 — show ONLY the batting team's row.
        // We use the direct LinearLayout references (not findViewWithTag)
        // and apply visibility = GONE which removes the row from layout
        // entirely, so the user only sees one row.
        boolean isTeam2Batting = "team2".equals(battingTeam);
        if (team1RowView != null) {
            team1RowView.setVisibility(isTeam2Batting ? View.GONE : View.VISIBLE);
        }
        if (team2RowView != null) {
            team2RowView.setVisibility(isTeam2Batting ? View.VISIBLE : View.GONE);
        }

        if (t1Name != null) t1Name.setText(team1Name);
        if (t2Name != null) t2Name.setText(team2Name);
        if (t1Score != null) t1Score.setText(team1Score);
        if (t2Score != null) t2Score.setText(team2Score);
        if (t1Overs != null) t1Overs.setText(team1Overs.isEmpty() ? "" : "(" + team1Overs + ")");
        if (t2Overs != null) t2Overs.setText(team2Overs.isEmpty() ? "" : "(" + team2Overs + ")");
        if (status != null) status.setText(statusText);
        if (batsman != null) batsman.setText(batsmanName.isEmpty() ? "" : "\uD83C\uDFCF " + batsmanName);
        // v1.0.16 Rev 7 — bowler row now shows only the bowler NAME.
        // Per-ball runs/W/Wd/Nb live in `overBallsView` directly below
        // (user explicitly asked: "Bowler k naam ek aage sirf overs ki
        // balls par aaya result dikhna chahiye, balls ka number nahi").
        // The bowlerName string is composed in match/[id].tsx and now
        // contains only the name (no O-M-R-W stats).
        if (bowler != null) bowler.setText(bowlerName.isEmpty() ? "" : "\u26BE " + bowlerName);
        if (overBallsView != null) {
            if (bowlerOverBalls != null && !bowlerOverBalls.isEmpty()) {
                overBallsView.setText(bowlerOverBalls);
                overBallsView.setVisibility(View.VISIBLE);
            } else {
                overBallsView.setVisibility(View.GONE);
            }
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification());
        }
    }

    private void toggleMinimize(WindowManager.LayoutParams params) {
        isMinimized = !isMinimized;

        LinearLayout mainLayout = (LinearLayout) floatingView;

        if (isMinimized) {
            // Hide everything below the visible team row to keep the
            // pill compact while minimized. Header + batting team row
            // stay visible.
            for (int i = 3; i < mainLayout.getChildCount(); i++) {
                mainLayout.getChildAt(i).setVisibility(View.GONE);
            }
        } else {
            for (int i = 0; i < mainLayout.getChildCount(); i++) {
                mainLayout.getChildAt(i).setVisibility(View.VISIBLE);
            }
            // v1.0.16 Rev 7 — Re-apply batting-team-only via direct refs.
            boolean isTeam2Batting = "team2".equals(battingTeam);
            if (team1RowView != null) {
                team1RowView.setVisibility(isTeam2Batting ? View.GONE : View.VISIBLE);
            }
            if (team2RowView != null) {
                team2RowView.setVisibility(isTeam2Batting ? View.VISIBLE : View.GONE);
            }
            // Hide over-balls strip if no data.
            if (overBallsView != null && (bowlerOverBalls == null || bowlerOverBalls.isEmpty())) {
                overBallsView.setVisibility(View.GONE);
            }
        }

        windowManager.updateViewLayout(floatingView, params);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();

        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }

        if (floatingView != null && windowManager != null) {
            windowManager.removeView(floatingView);
        }

        // v1.0.16 Rev 7 — release direct view refs so the next service
        // start gets a fresh layout (avoids leaking detached views).
        team1RowView = null;
        team2RowView = null;
        overBallsView = null;
    }
}
