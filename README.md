# Digital Signage CMS - Admin Update

現在のCMSに以下を追加した更新版です。

- 管理者タブ
  - コンテンツ管理
  - 顧客管理
  - プレイヤー管理
- 顧客ごとの現場割り当て
- 新規プレイヤー / 現場登録
- プレイヤー削除
- 顧客アカウント作成UI

## GitHubへ上書きするファイル

現在の `config.js` には Publishable key が入っているため、**config.js は上書きしないでください。**

以下の3ファイルだけ、GitHubリポジトリのルートへ上書きしてください。

- `index.html`
- `app.js`
- `styles.css`

## 顧客アカウント作成について

顧客作成はブラウザに Secret key / service_role key を置かないため、Supabase Edge Function `create-customer` を使用します。

このZIPには以下も同梱しています。

`supabase/functions/create-customer/index.ts`

Edge Functionをまだデプロイしていない場合でも、以下は先に利用できます。

- コンテンツ管理
- プレイヤー登録
- プレイヤー削除
- 既存顧客への現場割り当て

新しい顧客アカウントの作成だけは、Edge Function設定後に利用可能です。
