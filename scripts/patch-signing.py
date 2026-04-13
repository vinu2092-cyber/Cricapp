"""Patch build.gradle to use release-keystore.jks for signing."""
import re

BUILD_GRADLE = "frontend/android/app/build.gradle"

with open(BUILD_GRADLE, "r") as f:
    content = f.read()

NEW_SIGNING = (
    'signingConfigs {\n'
    '        debug {\n'
    "            storeFile file('debug.keystore')\n"
    "            storePassword 'android'\n"
    "            keyAlias 'androiddebugkey'\n"
    "            keyPassword 'android'\n"
    '        }\n'
    '        release {\n'
    "            storeFile file('release-keystore.jks')\n"
    '            storePassword System.getenv("KEYSTORE_PASSWORD")\n'
    '            keyAlias System.getenv("KEY_ALIAS")\n'
    '            keyPassword System.getenv("KEY_PASSWORD")\n'
    '        }\n'
    '    }'
)

# Replace signingConfigs block
pattern = re.compile(r'signingConfigs\s*\{.*?\n\s*\}', re.DOTALL)
match = pattern.search(content)
if match:
    content = content[:match.start()] + NEW_SIGNING + content[match.end():]
    print("signingConfigs replaced")

# Point release buildType to release signingConfig
content = content.replace(
    'signingConfig signingConfigs.debug',
    'signingConfig signingConfigs.release'
)
print("release buildType updated")

with open(BUILD_GRADLE, "w") as f:
    f.write(content)

print("build.gradle patched: release signing with release-keystore.jks")
