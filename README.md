# firearly-monitor

Firearly 홈페이지의 게임별 버전을 비교해 버전 변경 또는 새 게임 등록 시 한 번의 Discord 메시지로 알립니다.
설명·디자인·이미지·순서 변경과 게임 삭제에는 알림을 보내지 않습니다.

최초 실행은 `data/versions.json`만 생성하며 알림을 보내지 않습니다.
기존 `data/snapshot.json`은 버전 정보가 없어 사용하지 않습니다. 전환 후 첫 실행에서 새 기준을 만듭니다.
변경이 없어도 현재 버전 목록을 저장하며, 알림 전송 실패 시 기존 기준을 유지합니다.

## 로컬 실행

Node.js 22 이상을 사용합니다. `.env`에 `DISCORD_WEBHOOK_URL`을 설정한 뒤 실행합니다.

```sh
npm ci
npm run monitor
```

## GitHub Actions

- 저장소 Settings → Secrets and variables → Actions에 `DISCORD_WEBHOOK_URL`을 등록합니다. 로컬 `.env`는 GitHub Actions로 전달되지 않습니다.
- 기본 브랜치에 코드를 반영하면 매주 토요일 오전 11시(Asia/Seoul)에 실행합니다.
- Actions → Firearly Weekly Monitor → Run workflow로 수동 실행할 수 있습니다.
- 워크플로에 `contents: write`를 지정했습니다. 저장소/조직 정책과 브랜치 규칙에서 봇의 스냅샷 커밋을 허용해야 합니다.

추출 대상은 `.games-grid article.game-card .game-copy h2`의 제목과 `.game-version`입니다.
버전이 없는 컬렉션 카드와 컬렉션 내부 게임은 감시하지 않습니다.
제목 변경과 삭제 후 재등록은 신규 게임으로 감지합니다.
게임 버전이 하나도 추출되지 않거나 버전 형식이 잘못되면 기존 기준을 유지하고 실패 처리합니다.
JavaScript 실행 후에만 생성되는 목록은 지원하지 않습니다.

```sh
npm test
```
