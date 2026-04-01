package com.cricapp.live.floatingwidget;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

public class FloatingWidgetModule extends ReactContextBaseJavaModule {
    private final ReactApplicationContext reactContext;
    
    public FloatingWidgetModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }
    
    @NonNull
    @Override
    public String getName() {
        return "FloatingWidgetModule";
    }
    
    @ReactMethod
    public void checkOverlayPermission(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            promise.resolve(Settings.canDrawOverlays(reactContext));
        } else {
            promise.resolve(true);
        }
    }
    
    @ReactMethod
    public void requestOverlayPermission(Promise promise) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(reactContext)) {
                try {
                    Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + reactContext.getPackageName())
                    );
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    reactContext.startActivity(intent);
                    promise.resolve(false); // User needs to grant permission
                } catch (Exception e) {
                    promise.reject("ERROR", "Failed to open overlay settings: " + e.getMessage());
                }
            } else {
                promise.resolve(true); // Already has permission
            }
        } else {
            promise.resolve(true); // No permission needed
        }
    }
    
    @ReactMethod
    public void showFloatingWidget(ReadableMap scoreData, Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                promise.reject("NO_PERMISSION", "Overlay permission not granted. Please enable 'Display over other apps' permission.");
                return;
            }
            
            Intent intent = new Intent(reactContext, FloatingWidgetService.class);
            intent.setAction("UPDATE_SCORE");
            
            if (scoreData.hasKey("team1Name")) intent.putExtra("team1Name", scoreData.getString("team1Name"));
            if (scoreData.hasKey("team2Name")) intent.putExtra("team2Name", scoreData.getString("team2Name"));
            if (scoreData.hasKey("team1Score")) intent.putExtra("team1Score", scoreData.getString("team1Score"));
            if (scoreData.hasKey("team2Score")) intent.putExtra("team2Score", scoreData.getString("team2Score"));
            if (scoreData.hasKey("team1Overs")) intent.putExtra("team1Overs", scoreData.getString("team1Overs"));
            if (scoreData.hasKey("team2Overs")) intent.putExtra("team2Overs", scoreData.getString("team2Overs"));
            if (scoreData.hasKey("statusText")) intent.putExtra("statusText", scoreData.getString("statusText"));
            if (scoreData.hasKey("batsmanName")) intent.putExtra("batsmanName", scoreData.getString("batsmanName"));
            if (scoreData.hasKey("bowlerName")) intent.putExtra("bowlerName", scoreData.getString("bowlerName"));
            if (scoreData.hasKey("commentary")) intent.putExtra("commentary", scoreData.getString("commentary"));
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent);
            } else {
                reactContext.startService(intent);
            }
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to start floating widget: " + e.getMessage());
        }
    }
    
    @ReactMethod
    public void updateFloatingWidget(ReadableMap scoreData, Promise promise) {
        // Same as show - service handles updates
        showFloatingWidget(scoreData, promise);
    }
    
    @ReactMethod
    public void hideFloatingWidget(Promise promise) {
        try {
            Intent intent = new Intent(reactContext, FloatingWidgetService.class);
            intent.setAction("STOP_WIDGET");
            reactContext.startService(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", "Failed to hide floating widget: " + e.getMessage());
        }
    }
}
