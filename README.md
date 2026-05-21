# kokoni-ec1-desktop

KOKONI EC1 3DプリンターをPCから操作するためのデスクトップGUIアプリケーションです。
本アプリはWailsベースのデスクトップアプリケーションで、プリンターのMCUへ直接接続するのではなく、Android側HTTPエージェント(`kokoni-ec1-server`)へアクセスして操作を行います。先に導入しておくことをおすすめします。https://github.com/UltiMorse/kokoni-ec1-server

PC側からプリンターへ接続し、.gcodeのアップロード、印刷の開始などが可能です。必要であればPCを切断しても印刷は継続されるため、後でPCから再接続して監視・操作することもできます。

## 前提条件

このアプリ単体ではプリンターに接続できません。以下の条件を満たしている必要があります。

1. KOKONI EC1側で `kokoni_web` / `kokoni_launcher` が導入済みであること
2. PC側でADB経由でプリンターが認識されていること
3. `adb forward tcp:18080 tcp:8080` が有効であること
4. `http://127.0.0.1:18080/api/status` にアクセスでき、応答があること

また、gcodeもkokoni-ec1-serverリポジトリのconfigに記載のプロファイルを用いてUltimaker Curaでスライスすることを前提としています。

### 起動と接続に関して

アプリ本体（`kokoni-ec1-desktop.exe` など）をそのまま直接起動しても、通信経路が確保されていないためアプリ上でプリンターがConnectedにならず操作できません。
確実に接続させるため、アプリの起動前に以下の手順を順番に実行する起動用のスクリプト（ラッパースクリプト）を用意して運用することをおすすめします。

サンプルはkokoni-ec1-serverリポジトリのsampleにwindows、linuxそれぞれあります。デスクトップファイルなど用意すると快適です。

1. **ADBでのWi-Fi接続確立** (`adb connect <IP>:5555`)
2. **実機側のエージェント起動** (`kokoni_launcher start` やサーバー等)
3. **ポート転送の設定** (`adb forward tcp:18080 tcp:8080`)
4. **エージェントの準備完了待機** (`http://127.0.0.1:18080/api/status` が応答するまで待機)

上記の手順がすべて完了した後に最後にデスクトップアプリを起動することで、正常に通信が行えるようになります。

## 主な機能

- **Job**: .gcodeファイルのアップロード、開始、一時停止、再開、キャンセル、進捗状況の表示
- **Printer**: 接続管理、ライトON/OFF
- **Filament**: 加熱(200℃)、冷却、ロード/アンロード、微調整
- **Leveling/Access**: ホーム移動、指定位置(前後左右・中央)への移動
- **Logs**: エージェントログ

## 開発・ビルド環境

Linux(WSL含む)およびWindowsに対応しています。

### 必須要件
- Go 1.23.0
- Node.js / npm
- Wails CLI v2.12.0
- ADB (Android SDK Platform Tools)
- (Linuxのみ) GTK / WebKitGTK 開発用パッケージ
- (Windowsのみ) WebView2 Runtime

### Linux / WSL での環境構築 (Ubuntuの例)
```bash
sudo apt update
sudo apt install -y build-essential pkg-config libgtk-3-dev libwebkit2gtk-4.0-dev nodejs npm android-tools-adb
# Ubuntu 24.04などでは libwebkit2gtk-4.1-dev を使用
```

Wails CLIのインストールとフロントエンド依存関係の解決:
```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd frontend
npm install
```

### Windows での環境構築
```powershell
winget install GoLang.Go
winget install OpenJS.NodeJS.LTS
winget install Google.PlatformTools
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

## ビルド・起動

### Linux / WSL
```bash
# 開発モード
wails dev # (Ubuntu 24.04では wails dev -tags webkit2_41)

# ビルド
wails build # (Ubuntu 24.04では wails build -tags webkit2_41)
./build/bin/kokoni-ec1-desktop
```

### Windows
```powershell
# 開発モード
wails dev

# ビルド
wails build
.\build\bin\kokoni-ec1-desktop.exe
```
