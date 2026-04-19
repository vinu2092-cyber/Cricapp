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

public class FloatingWidgetService extends Service implements TextToSpeech.OnInitListener {
    private static final String CHANNEL_ID = "floating_widget_channel";
    private static final int NOTIFICATION_ID = 1001;
    
    private WindowManager windowManager;
    private View floatingView;
    private boolean isMinimized = false;
    
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
                
                String newCommentary = intent.getStringExtra("commentary");
                if (newCommentary != null && !newCommentary.isEmpty() && !newCommentary.equals(lastSpokenCommentary)) {
                    commentary = newCommentary;
                    speakCommentary(commentary);
                    lastSpokenCommentary = commentary;
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
                muteBg.setCornerRadius(14f);
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
        
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CricApp Live Score")
            .setContentText(team1Name + " " + team1Score + " vs " + team2Name + " " + team2Score)
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
        params.x = 20;
        params.y = 150;
        
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
        
        LinearLayout mainLayout = new LinearLayout(context);
        mainLayout.setOrientation(LinearLayout.VERTICAL);
        mainLayout.setPadding(32, 20, 32, 20);
        
        android.graphics.drawable.GradientDrawable background = new android.graphics.drawable.GradientDrawable();
        background.setColor(0x70000000);
        background.setCornerRadius(32f);
        background.setStroke(2, 0x804CAF50);
        mainLayout.setBackground(background);
        
        LinearLayout headerLayout = new LinearLayout(context);
        headerLayout.setOrientation(LinearLayout.HORIZONTAL);
        headerLayout.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams headerParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        headerParams.setMargins(0, 0, 0, 16);
        headerLayout.setLayoutParams(headerParams);
        
        TextView liveBadge = new TextView(context);
        liveBadge.setText("● LIVE");
        liveBadge.setTextColor(0xFFFFFFFF);
        liveBadge.setTextSize(10);
        liveBadge.setTypeface(null, android.graphics.Typeface.BOLD);
        liveBadge.setPadding(14, 5, 14, 5);
        android.graphics.drawable.GradientDrawable liveBg = new android.graphics.drawable.GradientDrawable();
        liveBg.setColor(0xCCFF4444);
        liveBg.setCornerRadius(14f);
        liveBadge.setBackground(liveBg);
        
        muteButton = new TextView(context);
        muteButton.setText("\uD83D\uDD0A");
        muteButton.setTextSize(15);
        muteButton.setPadding(14, 6, 14, 6);
        muteButton.setGravity(Gravity.CENTER);
        android.graphics.drawable.GradientDrawable muteBg = new android.graphics.drawable.GradientDrawable();
        muteBg.setColor(0x5044BB44);
        muteBg.setCornerRadius(14f);
        muteButton.setBackground(muteBg);
        muteButton.setOnClickListener(v -> toggleMute());
        
        TextView dragIndicator = new TextView(context);
        dragIndicator.setText("⋮⋮");
        dragIndicator.setTextColor(0xAAFFFFFF);
        dragIndicator.setTextSize(14);
        dragIndicator.setPadding(10, 0, 10, 0);
        dragIndicator.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        dragIndicator.setGravity(Gravity.CENTER);
        
        TextView closeBtn = new TextView(context);
        closeBtn.setText("✕");
        closeBtn.setTextColor(0xFFFFFFFF);
        closeBtn.setTextSize(16);
        closeBtn.setTypeface(null, android.graphics.Typeface.BOLD);
        closeBtn.setPadding(16, 8, 16, 8);
        android.graphics.drawable.GradientDrawable closeBg = new android.graphics.drawable.GradientDrawable();
        closeBg.setColor(0x50FF4444);
        closeBg.setCornerRadius(14f);
        closeBtn.setBackground(closeBg);
        closeBtn.setOnClickListener(v -> stopSelf());
        
        headerLayout.addView(liveBadge);
        headerLayout.addView(muteButton);
        headerLayout.addView(dragIndicator);
        headerLayout.addView(closeBtn);
        mainLayout.addView(headerLayout);
        
        mainLayout.addView(createTeamRow(context, "team1"));
        mainLayout.addView(createTeamRow(context, "team2"));
        
        TextView statusView = new TextView(context);
        statusView.setTag("statusText");
        statusView.setTextColor(0xFFFFD700);
        statusView.setTextSize(12);
        statusView.setGravity(Gravity.CENTER);
        statusView.setPadding(0, 14, 0, 6);
        statusView.setShadowLayer(3f, 1f, 1f, 0x99000000);
        mainLayout.addView(statusView);
        
        LinearLayout playerLayout = new LinearLayout(context);
        playerLayout.setOrientation(LinearLayout.HORIZONTAL);
        playerLayout.setGravity(Gravity.CENTER);
        playerLayout.setPadding(0, 6, 0, 0);
        
        TextView batsmanView = new TextView(context);
        batsmanView.setTag("batsmanName");
        batsmanView.setTextColor(0xFF66FF66);
        batsmanView.setTextSize(11);
        batsmanView.setShadowLayer(2f, 1f, 1f, 0x99000000);
        
        TextView vsView = new TextView(context);
        vsView.setText("  vs  ");
        vsView.setTextColor(0xFFCCCCCC);
        vsView.setTextSize(11);
        
        TextView bowlerView = new TextView(context);
        bowlerView.setTag("bowlerName");
        bowlerView.setTextColor(0xFF66B3FF);
        bowlerView.setTextSize(11);
        bowlerView.setShadowLayer(2f, 1f, 1f, 0x99000000);
        
        playerLayout.addView(batsmanView);
        playerLayout.addView(vsView);
        playerLayout.addView(bowlerView);
        mainLayout.addView(playerLayout);
        
        TextView hintView = new TextView(context);
        hintView.setText("Tap to minimize • Drag to move");
        hintView.setTextColor(0xAAFFFFFF);
        hintView.setTextSize(9);
        hintView.setGravity(Gravity.CENTER);
        hintView.setPadding(0, 10, 0, 0);
        mainLayout.addView(hintView);
        
        return mainLayout;
    }
    
    private LinearLayout createTeamRow(Context context, String tag) {
        LinearLayout rowLayout = new LinearLayout(context);
        rowLayout.setOrientation(LinearLayout.HORIZONTAL);
        rowLayout.setGravity(Gravity.CENTER_VERTICAL);
        rowLayout.setPadding(20, 14, 20, 14);
        
        android.graphics.drawable.GradientDrawable rowBg = new android.graphics.drawable.GradientDrawable();
        rowBg.setColor(0x30FFFFFF);
        rowBg.setCornerRadius(14f);
        rowLayout.setBackground(rowBg);
        
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        );
        rowParams.setMargins(0, 5, 0, 5);
        rowLayout.setLayoutParams(rowParams);
        
        TextView teamName = new TextView(context);
        teamName.setTag(tag + "Name");
        teamName.setTextColor(0xFFFFFFFF);
        teamName.setTextSize(17);
        teamName.setTypeface(null, android.graphics.Typeface.BOLD);
        teamName.setMinWidth(90);
        teamName.setShadowLayer(3f, 1f, 1f, 0x99000000);
        
        TextView score = new TextView(context);
        score.setTag(tag + "Score");
        score.setTextColor(0xFF4AE54A);
        score.setTextSize(24);
        score.setTypeface(null, android.graphics.Typeface.BOLD);
        score.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        score.setGravity(Gravity.END);
        score.setShadowLayer(3f, 1f, 1f, 0x99000000);
        
        TextView overs = new TextView(context);
        overs.setTag(tag + "Overs");
        overs.setTextColor(0xFFE0E0E0);
        overs.setTextSize(13);
        overs.setPadding(14, 0, 0, 0);
        overs.setMinWidth(70);
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
        
        if (t1Name != null) t1Name.setText(team1Name);
        if (t2Name != null) t2Name.setText(team2Name);
        if (t1Score != null) t1Score.setText(team1Score);
        if (t2Score != null) t2Score.setText(team2Score);
        if (t1Overs != null) t1Overs.setText(team1Overs.isEmpty() ? "" : "(" + team1Overs + ")");
        if (t2Overs != null) t2Overs.setText(team2Overs.isEmpty() ? "" : "(" + team2Overs + ")");
        if (status != null) status.setText(statusText);
        if (batsman != null) batsman.setText(batsmanName.isEmpty() ? "" : "\uD83C\uDFCF " + batsmanName);
        if (bowler != null) bowler.setText(bowlerName.isEmpty() ? "" : "⚾ " + bowlerName);
        
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, createNotification());
        }
    }
    
    private void toggleMinimize(WindowManager.LayoutParams params) {
        isMinimized = !isMinimized;
        
        LinearLayout mainLayout = (LinearLayout) floatingView;
        
        if (isMinimized) {
            for (int i = 3; i < mainLayout.getChildCount(); i++) {
                mainLayout.getChildAt(i).setVisibility(View.GONE);
            }
        } else {
            for (int i = 0; i < mainLayout.getChildCount(); i++) {
                mainLayout.getChildAt(i).setVisibility(View.VISIBLE);
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
    }
}
