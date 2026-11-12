# 티라미슈

마누카 페르소나로 대화하는 Discord 봇. 모델은 기본 `gpt-6-luna`이며 [persona.txt](persona.txt)에서 말투를 관리한다.

## 실행

Node.js 22.12 이상에서 `npm install` 후 `npm start`. 토큰을 소스에 넣지 않는다.

DisHost 대시보드에서 대상 봇의 간편 설정 → 환경변수 (.env) 설정에 `DISCORD_TOKEN`과 `OPENAI_API_KEY`를 등록하고 저장한다. 시작 코드는 프로젝트 루트의 `.env`를 읽으며, 실행 환경에 이미 설정된 값이 우선한다. 에이전트가 보안 입력으로 값을 받은 경우 연결된 `dishost` MCP의 `set_env`로 등록한다. 선택 변수 `OPENAI_MODEL`로 모델을 지정할 수 있다. `dishost.json`의 `env`는 시크릿을 담지 않는다. `.env`는 Git에 올리지 않는다.

Discord 초대 시 `bot`, `applications.commands` scope와 채널 보기·메시지 보내기 권한이 필요하다. `/대화 내용:`, `/초기화`, `/상태`를 사용한다. Message Content Intent는 사용하지 않는다. 대화 명령의 응답은 채널에 공개된다.

대화 입력과 최근 대화는 OpenAI API로 전송된다. 요청에는 `store: false`를 지정한다. 사용자 ID·채널 ID 조합별 최근 6쌍의 입력·응답만 메모리에 보관하며, 30분 미사용 또는 재시작 시 지워진다. 영구 기억이나 음성 기능은 없다. 입력과 토큰은 로그에 기록하지 않는다.

## 배포 확인

원격 MCP에서는 `dishost` 연결과 DisHost GitHub App의 저장소 접근 권한이 필요하다. 배포할 GitHub 저장소와 브랜치는 사용자가 지정한다. 이 폴더의 파일을 저장소 루트에 올리고 `deploy_from_github`에 저장소·브랜치·대상 봇을 전달한다. 진입점은 [dishost.json](dishost.json)을 따른다.

`wait_for_deploy`, `recent_logs`, `bot_status` 순서로 확인한다. 성공 기준은 배포 완료, `Discord ready`, 명령 등록 로그다. 이어 초대한 Discord 서버의 채널에서 `/대화` 공개 응답, `/초기화`, `/상태`를 직접 확인한다. 모델 접근 오류는 API 키의 모델 사용 권한과 결제 상태를 확인하며, 모델을 임의로 바꾸지 않는다. 소유자는 DisHost 대시보드에서 만료일을 확인하고 만료 전에 이용 기간을 연장한다.

`npm test`는 네트워크를 사용하지 않는 요청 처리 검증이다. 실제 Discord 로그인이나 OpenAI 계정의 모델 사용 권한을 증명하지 않는다.

문제 진단 시에만 `OPENAI_STARTUP_CHECK=1`을 설정하면 부팅마다 짧은 실제 API 요청을 1회 보내고 성공 여부와 허용된 오류 코드만 로그에 기록한다. 소량의 API 사용량이 발생할 수 있다. 확인 후 `0`으로 되돌린다. API 오류 원문과 키, 사용자 대화는 기록하지 않는다.
