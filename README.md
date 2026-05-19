# kokoni-ec1-desktop

KOKONI EC1 3DプリンターをPCから操作するためのデスクトップGUIアプリケーションです。
本アプリはWailsベースのデスクトップアプリケーションで、プリンターのMCUへ直接接続するのではなく、Android側HTTPエージェント(`kokoni-ec1-server`)へアクセスして操作を行います。

```text
Desktop GUI
  |
  | http://127.0.0.1:18080
  v
adb forward tcp:18080 tcp:8080
  |
  v
KOKONI EC1 Android-side kokoni_web agent
  |
  | /dev/ttyS1 115200bps
  v
Printer MCU
```

PC側からプリンターへ接続し、.gcodeのアップロード、印刷の開始などが可能です。必要であればPCを切断しても印刷は継続されるため、後でPCから再接続して監視・操作することもできます。

## 関連プロジェクト

このGUIは、サーバー側プロジェクトがインストール済みで稼働していることを前提としています。

- **kokoni-ec1-server**: Android側HTTPエージェント(`kokoni_web`)やランチャー(`kokoni_launcher`)、接続・ポートフォワーディングを設定するスクリプト(`scripts/run.sh`)が含まれます。

GUIがアクセスするローカルAPIエンドポイント:
`http://127.0.0.1:18080`

## 前提条件

このアプリ単体ではプリンターに接続できません。以下の条件を満たしている必要があります。

1. KOKONI EC1側で `kokoni_web` / `kokoni_launcher` が導入済みであること
2. PC側でADB経由でプリンターが認識されていること
3. `adb forward tcp:18080 tcp:8080` が有効であること
4. `http://127.0.0.1:18080/api/status` にアクセスでき、応答があること

### ADB接続手順 (Wi-Fi ADBの例)

プリンターのIPアドレスが `192.168.11.25` の場合：

```bash
adb connect 192.168.11.25:5555
adb devices
```
接続後、サーバー側のスクリプトを実行しポートフォワーディングを設定します。
```bash
cd ~/src/kokoni-ec1-server
./scripts/run.sh
```
※手動で設定する場合は `adb forward tcp:18080 tcp:8080` を実行してください。

## 主な機能

- **Job**: .gcodeファイルのアップロード、開始、一時停止、再開、キャンセル、進捗状況の表示
- **Printer**: 接続管理、ライトON/OFF
- **Filament**: 加熱(200℃)、冷却、ロード/アンロード、微調整
- **Leveling/Access**: ホーム移動、指定位置(前後左右・中央)への移動
- **Logs**: エージェントログの表示(自動更新)

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
※ `wails` や `npm` が実行できない場合はPATHの設定や、PowerShellの実行ポリシー(`Set-ExecutionPolicy`)を確認してください。

## ビルド・起動

### Linux / WSL
```bash
# 開発モード
wails dev # (Ubuntu 24.04では wails dev -tags webkit2_41)

# ビルド
wails build # (Ubuntu 24.04では wails build -tags webkit2_41)
./build/bin/kokoni-ec1-desktop
```

#### Linuxランチャー（デスクトップ登録）例
`~/.local/share/applications/kokoni-ec1.desktop` 等を作成し、ビルドしたバイナリを `Exec` に指定することでデスクトップアプリとして登録できます。

### Windows
```powershell
# 開発モード
wails dev

# ビルド
wails build
.\build\bin\kokoni-ec1-desktop.exe
```

#### Windows用起動スクリプト
GUIを起動する前にADB接続とポートフォワードを行うスクリプトを作成しておくと便利です。
以下のようなPowerShellスクリプトを作成して起動できます。
```powershell
adb connect 192.168.11.25:5555
adb forward --remove tcp:18080 2>$null
adb forward tcp:18080 tcp:8080
cd C:\Users\username\src\kokoni-ec1-desktop
.\build\bin\kokoni-ec1-desktop.exe
```

## トラブルシューティング

- **接続エラー (`Connection refused`)**: 
  PC側の `127.0.0.1:18080` にアクセスできない場合、ADB接続かポートフォワーディングが切れている可能性があります。`adb devices` で認識されているか確認し、再度接続と `adb forward tcp:18080 tcp:8080` を実行してください。
- **ビルドしたバイナリがない**: 
  `wails dev` だけではバイナリが残らないことがあります。`wails build` を実行してください。
