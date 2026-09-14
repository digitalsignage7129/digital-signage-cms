# Digital Signage CMS Demo

Supabase と連携する静的Web管理画面です。

## 1. Supabase keyを設定
`config.js` を開き、以下の `PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE` を Supabase の **Publishable key** に置き換えてください。

```js
window.SIGNAGE_CONFIG = {
  SUPABASE_URL: "https://mnhfiprqvwbjtkxueesu.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "PASTE_YOUR_SB_PUBLISHABLE_KEY_HERE",
  STORAGE_BUCKET: "signage-media"
};
```

**Secret key / service_role key は絶対に入れないでください。**

## 2. 起動方法
このCMSは `file://` 直開きより、HTTP/HTTPSで開くことを推奨します。

### GitHub Pages
リポジトリにこのフォルダの中身をアップロードし、GitHub Pagesを有効化してください。

### Macでローカル確認
ターミナルでこのフォルダに移動し、以下を実行：

```bash
python3 -m http.server 8080
```

ブラウザで `http://localhost:8080` を開きます。

## 3. 現在の機能
- Supabase Auth メール/パスワードログイン
- `profiles.role` 表示
- RLSにより、adminは全site、customerは割当siteのみ表示
- タイトル / 工事名変更
- 挨拶 / お知らせ / 週間工程 画像アップロード
- PR動画アップロード（50MB以下）
- Storage: `signage-media/{site_id}/...`
- `sites`テーブルのパスを更新
- 週間天気 / 週間降水 URL表示

## 4. まだ未実装
- 管理者による顧客アカウント新規作成
- 新規プレイヤー / site 作成
- 顧客へのsite割り当て/解除
- 自動プレイヤー登録コード

これらは次段階で管理者専用画面として追加できます。
