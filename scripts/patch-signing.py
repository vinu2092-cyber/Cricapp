"""Patch build.gradle to use release-keystore.jks for signing."""

BUILD_GRADLE = "frontend/android/app/build.gradle"

with open(BUILD_GRADLE, "r") as f:
    content = f.read()

# --- Step 1: Replace signingConfigs block using balanced-brace matching ---
sc_keyword = "signingConfigs"
sc_start = content.find(sc_keyword)
if sc_start == -1:
    raise SystemExit("ERROR: 'signingConfigs' not found in build.gradle")

brace_pos = content.find('{', sc_start)
depth = 0
end = brace_pos
for i in range(brace_pos, len(content)):
    if content[i] == '{':
        depth += 1
    elif content[i] == '}':
        depth -= 1
        if depth == 0:
            end = i + 1
            break

print(f"Found signingConfigs block: {repr(content[sc_start:end][:80])}...")

NEW_SIGNING = """signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            storeFile file('release-keystore.jks')
            storeType "PKCS12"
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }
    }"""

content = content[:sc_start] + NEW_SIGNING + content[end:]
print("signingConfigs replaced with debug + release configs")

# --- Step 2: Point release buildType to signingConfigs.release ---
# The release buildType has the LAST occurrence of 'signingConfig signingConfigs.debug'
target = "signingConfig signingConfigs.debug"
last_pos = content.rfind(target)
if last_pos != -1:
    content = content[:last_pos] + "signingConfig signingConfigs.release" + content[last_pos + len(target):]
    print("release buildType -> signingConfigs.release")
else:
    print("WARNING: No 'signingConfig signingConfigs.debug' found to replace")

with open(BUILD_GRADLE, "w") as f:
    f.write(content)

print("build.gradle patched successfully!")
