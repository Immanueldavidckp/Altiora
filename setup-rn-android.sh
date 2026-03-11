#!/bin/bash
set -e

echo "==========================================================="
echo "   React Native Android Environment Setup for Fedora       "
echo "==========================================================="

echo -e "\n[1/6] Installing system dependencies (Java 17, curl, unzip)..."
echo "You may be prompted for your sudo password by dnf:"
sudo dnf install -y java-17-openjdk-devel curl unzip wget

echo -e "\n[2/6] Installing NVM (Node Version Manager) and Node.js v20 LTS..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20
nvm use 20

echo -e "\n[3/6] Downloading Android SDK Command-line Tools..."
ANDROID_PREFIX="$HOME/Android/Sdk"
mkdir -p "$ANDROID_PREFIX/cmdline-tools"

# Download the latest command line tools (Version 11076708 is the latest as of 2024)
cd "$ANDROID_PREFIX/cmdline-tools"
wget -q --show-progress https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O cmdline-tools.zip
unzip -q cmdline-tools.zip
rm cmdline-tools.zip

# The tools need to be inside a folder named "latest" for sdkmanager to work correctly without warnings
if [ -d "cmdline-tools" ]; then
    rm -rf latest
    mv cmdline-tools latest
fi

# Set environment strings temporarily to use sdkmanager
export ANDROID_HOME="$ANDROID_PREFIX"
export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator"

echo -e "\n[4/6] Accepting Android SDK licenses and downloading packages (This might take a while)..."
yes | sdkmanager --licenses > /dev/null
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" "emulator" "system-images;android-34;google_apis;x86_64"

echo -e "\n[5/6] Creating Android Virtual Device (AVD) named 'RN_Emulator'..."
# Create the AVD automatically, forcing overwrite if it exists, without custom hardware profile questions
echo "no" | avdmanager create avd -n RN_Emulator -k "system-images;android-34;google_apis;x86_64" -f

echo -e "\n[6/6] Configuring ~/.bashrc environment variables..."
if ! grep -q "ANDROID_HOME" ~/.bashrc; then
cat << 'EOF' >> ~/.bashrc

# React Native Android Environment Variables
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
EOF
    echo "Environment variables added to ~/.bashrc"
else
    echo "ANDROID_HOME already exists in ~/.bashrc, skipping."
fi

echo "==========================================================="
echo " Setup Complete! 🎉"
echo "==========================================================="
echo "To apply the changes, please restart your terminal or run:"
echo "source ~/.bashrc"
echo ""
echo "You can verify the setup by running:"
echo "1. node -v"
echo "2. java -version"
echo "3. adb devices"
echo "4. emulator -list-avds"
echo "5. emulator -avd RN_Emulator  # (to launch the emulator)"
