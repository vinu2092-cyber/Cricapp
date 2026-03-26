#!/bin/bash

#############################################
# Cricket App - Android Build Script
# This script builds both APK and AAB files
#############################################

echo "=========================================="
echo "🏏 CRICKET APP - ANDROID BUILD SCRIPT"
echo "=========================================="
echo ""

# Navigate to frontend directory
cd /app/frontend

# Step 1: Login to EAS
echo "Step 1: Logging into EAS..."
echo "Username: CricApp"
echo "Password: Vinod2029@"
echo ""
npx eas-cli login

# Check if login was successful
if [ $? -ne 0 ]; then
    echo "❌ Login failed. Please run 'npx eas-cli login' manually."
    exit 1
fi

echo ""
echo "✅ Login successful!"
echo ""

# Step 2: Build Universal APK (Preview)
echo "=========================================="
echo "Step 2: Building Universal APK (Preview)"
echo "=========================================="
echo ""
echo "This will create a single APK that works on all devices."
echo "Build type: Release"
echo "Profile: preview"
echo ""

npx eas-cli build --platform android --profile preview

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ APK build queued successfully!"
else
    echo ""
    echo "⚠️ APK build failed or was cancelled."
fi

echo ""
echo "=========================================="

# Step 3: Build AAB (Production)
echo "Step 3: Building AAB (Production)"
echo "=========================================="
echo ""
echo "This will create an Android App Bundle for Play Store."
echo "Build type: App Bundle"
echo "Profile: production"
echo ""

npx eas-cli build --platform android --profile production

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ AAB build queued successfully!"
else
    echo ""
    echo "⚠️ AAB build failed or was cancelled."
fi

echo ""
echo "=========================================="
echo "✅ BUILD SCRIPT COMPLETE"
echo "=========================================="
echo ""
echo "📊 Check your builds at:"
echo "https://expo.dev/accounts/vinu2092/projects/cric-app/builds"
echo ""
echo "⏱️ Builds typically take 15-30 minutes each."
echo ""
echo "📱 Once complete, you can download:"
echo "  - APK: Direct install on any Android device"
echo "  - AAB: Upload to Google Play Store"
echo ""
echo "=========================================="
