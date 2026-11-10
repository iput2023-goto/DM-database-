# デュエマ管理アプリ Android版 ビルド＆利用ガイド

本プロジェクトは **Capacitor** を用いて Android Studio 向けにアプリ化されています。
公式全カードデータベース（`dm_cards.db`）がアプリ内に内蔵されており、**完全オフラインで超高速検索・ストレージ管理** が動作します。

---

## 1. 生成済み APK の場所
すでにデバッグ用 APK が正常にビルド・生成されています。  
Android 実機に直接転送してインストールすることも可能です。

- **APK ファイルパス**:  
  `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 2. Android Studio で開いて実行する方法

### 手順 A: コマンド一発で起動する場合
ターミナル（PowerShell）でプロジェクトフォルダに移動し、以下を実行します：
```powershell
npm.cmd run open:android
```
※ 自動的に Android Studio が起動し、`android` プロジェクトが開かれます。

### 手順 B: Android Studio から手動で開く場合
1. **Android Studio** を起動します。
2. 「**Open**」をクリックします。
3. 次のフォルダを選択して「OK」を押します：  
   `C:\Users\miyaz\Downloads\DM-database--main (1)\DM-database--main\android`

---

## 3. アプリの実行（実機またはエミュレータ）

1. **実機を接続**（USBデバッグをONにしたスマートフォンをPCに接続）するか、Android Studio 上で **Virtual Device（エミュレータ）** を選択します。
2. Android Studio 画面上部の **緑色の再生ボタン（Run 'app'）** をクリックします。
3. 自動的にビルド・インストールが行われ、スマートフォン（またはエミュレータ）上でアプリが起動します！

---

## 4. Web 画面やコードを修正したときの更新手順

画面のデザインや TypeScript コードを変更した場合、以下のコマンドを実行するだけで自動的に Android プロジェクトへ同期されます：

```powershell
npm.cmd run build:android
```
このコマンドにより：
1. Next.js の静的エクスポートを実行
2. 最新のカードデータベースを Android assets にコピー
3. Android プロジェクトへアセットを自動同期（`cap sync`）
が自動的に完了します。

---

## 5. PC版ローカルサーバーとの両立について

Android アプリ化の設定を行っても、PC上での通常利用（`npm.cmd run dev`、`npm.cmd run build`、`デュエマ管理アプリ.exe`）には一切影響ありません。PC上では従来通りローカルサーバーとして稼働します。
