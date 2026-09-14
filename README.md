# Digital Signage CMS - Device Link Update

기존 관리자 CMS에 **실제 Android V3 단말 등록코드 연결 기능**을 추가한 업데이트입니다.

GitHub에는 아래 3개만 덮어쓰면 됩니다.
- index.html
- app.js
- styles.css

기존 `config.js`는 Publishable key가 들어 있으므로 덮어쓰지 마세요.

## 새 기능
- プレイヤー管理 화면에 `実機の登録コード` 영역 추가
- V3 앱에서 올라온 등록코드 확인
- 등록코드를 demo001/demo002 등 Site ID에 연결/해제
- 연결 후 V3 앱이 자동으로 Site ID를 받아 CMS 콘텐츠를 수신
