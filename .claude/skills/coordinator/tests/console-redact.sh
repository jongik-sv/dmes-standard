#!/usr/bin/env bash
# lib/console-redact.sh(콘솔 화면 가림·프롬프트 정리)를 확인한다. 네트워크·터미널·~/.coord 는 쓰지 않는다.
# 사용법: bash tests/console-redact.sh   (실패가 있으면 종료 코드 1)
# 가짜 비밀은 모두 이 파일 안에서 조립한다(실제 키처럼 보이는 문자열을 저장소에 남기지 않는다).
# gawk 가 있으면 awk→gawk 심을 PATH 앞에 둔 채 한 번 더 돌린다(GNU 에서도 같은지).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
LIB="$here/../scripts/lib/console-redact.sh"
. "$here/../scripts/lib/compat.sh"
# shellcheck source=../scripts/lib/console-redact.sh
. "$LIB"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/console-redact-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
PGIDS=""   # 시간 제한 시험이 만든 프로세스 그룹들 — 끝날 때 남은 것을 모두 끈다
cleanup() { local g; for g in $PGIDS; do compat_kill_pgroup "$g"; done; rm -rf "$tmp"; }
trap cleanup EXIT
pass=0; fail=0
chk() { if [ "$1" = ok ]; then echo "ok   $2"; pass=$((pass + 1)); else echo "FAIL $2${3:+ — $3}"; fail=$((fail + 1)); fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }
rep() { printf -- "$1%.0s" $(seq 1 "$2"); }   # rep <글> <횟수>(글은 printf 형식으로 쓰이므로 % 와 \ 를 넣지 않는다)
R() { printf '%s\n' "$1" | console_redact_text; }          # 한 줄 가림
S() { printf '%s' "$1" | console_screen_filter; }          # 화면 필터
none() { printf '%s' "$1" | grep -cF -- "$2"; }            # 결과에 원본 조각이 몇 줄 남았나(0 이어야 한다)
M='[가림]'

# --- 가짜 비밀 조립 -------------------------------------------------------------
SK1="sk-$(rep a 24)"                          # 규칙 1: 소문자만(규칙 6 에 안 걸리므로 규칙 1 이 가린다)
SK2="sk-ant-api03-$(rep Ab9_ 20)"             # 규칙 1: Anthropic 형
SK15="sk-$(rep a 15)"                         # 16자 미만 → 두지만 짧다
PAT="dflow_pat_$(rep x9 10)"                  # 규칙 2
JWT="eyJ$(rep hd 6).eyJ$(rep pl 8).$(rep sg 10)"   # 규칙 3
HEX40="$(rep a1 20)"                          # 규칙 6ⓐ 40자 hex(전체 SHA 모양)
HEX64="$(rep 0f 32)"
HEX39="$(rep a1 19)a"
B64="$(rep Ab3 15)"                           # 규칙 6ⓑ 45자 섞임
AWS="$(rep Ab 10)/$(rep Cd 5)+$(rep Ef 5)"    # 규칙 6ⓑ / 와 + 가 섞인 41자
SLB="$(rep AB3c 4)/$(rep XY9z 4)/$(rep QW2e 4)/$(rep RT5y 4)"   # / 3개 + 없는 base64 모양(경로 아님)

# --- 규칙 1 sk- ----------------------------------------------------------------
eq "규칙1: 소문자 sk- 키" "$(R "key is $SK1 ok")" "key is $M ok"
eq "규칙1: sk-ant-api03 키" "$(R "x $SK2")" "x $M"
eq "규칙1: 환경 변수 값(이름은 둔다)" "$(R "export OPENAI_API_KEY=$SK1")" "export OPENAI_API_KEY=$M"
eq "규칙1: 16자 미만은 두지 않는다(가리지 않음)" "$(R "id $SK15")" "id $SK15"
# --- 규칙 2 dflow_pat_ ---------------------------------------------------------
eq "규칙2: D'Flow PAT" "$(R "use $PAT now")" "use $M now"
# --- 규칙 3 JWT ----------------------------------------------------------------
eq "규칙3: JWT 세 토막" "$(R "jwt $JWT end")" "jwt $M end"
# --- 규칙 4 이름=값 ------------------------------------------------------------
eq "규칙4: password=값" "$(R "password=hunter2x")" "password=$M"
eq "규칙4: 대문자 이름 + 따옴표 값 전체" "$(R 'DB_PASSWORD: "my pass word"')" "DB_PASSWORD: \"$M\""
eq "규칙4: JSON 키(이름 뒤 따옴표)" "$(R '{"api_key": "abc123", "user": "kim"}')" "{\"api_key\": \"$M\", \"user\": \"kim\"}"
eq "규칙4: my_secret_key = 값" "$(R "my_secret_key = s3cr3t")" "my_secret_key = $M"
eq "규칙4: ACCESS_TOKEN=값" "$(R "ACCESS_TOKEN=abcdef")" "ACCESS_TOKEN=$M"
eq "규칙4: DFLOW_PAT=값(pat 토막)" "$(R "DFLOW_PAT=abcdef")" "DFLOW_PAT=$M"
eq "규칙4: api-key:값" "$(R "api-key:xyz")" "api-key:$M"
eq "규칙4: ApiKey = 값(대소문자 무시)" "$(R "ApiKey = xyz")" "ApiKey = $M"
eq "규칙4: 숫자 암호도 가린다(pwd=1234)" "$(R "pwd=1234")" "pwd=$M"
eq "규칙4: token := 값" "$(R 'token := "abc"')" "token := \"$M\""
eq "규칙4: 닫는 따옴표 없으면 줄 끝까지" "$(R "password: 'open value here")" "password: '$M"
eq "규칙4: 이미 [가림] 인 값은 그대로" "$(R "token: $M")" "token: $M"
eq "규칙4: URL 질의 access_token" "$(R "GET /cb?access_token=abc&x=1 HTTP")" "GET /cb?access_token=$M HTTP"
eq "규칙4: 한글 이름(비밀번호:)" "$(R "비밀번호: 1234")" "비밀번호: $M"
eq "규칙4: tokens(개수)가 문자 값이면 가린다" "$(R "tokens: abc")" "tokens: $M"
eq "규칙4 확장: URL 사용자:암호@" "$(R "git clone https://kim:pw123@host/r.git")" "git clone https://kim:$M@host/r.git"
# --- 규칙 5 Authorization·Bearer ----------------------------------------------
eq "규칙5: Authorization 줄 나머지" "$(R "Authorization: Basic dXNlcjpwYXNz")" "Authorization: $M"
eq "규칙5: 소문자 헤더 + 따옴표 속" "$(R 'curl -H "authorization: Bearer abc.def"')" "curl -H \"authorization: $M"
eq "규칙5: 줄 어디서든 Bearer 값" "$(R "send Bearer abcdef please")" "send Bearer $M please"
eq "규칙5→4: token: Bearer 값 모두 가림" "$(R "token: Bearer abcdef")" "token: $M $M"
# --- 규칙 6 긴 base64·hex ------------------------------------------------------
eq "규칙6: 40자 hex(git 전체 SHA)" "$(R "commit $HEX40")" "commit $M"
eq "규칙6: 64자 hex" "$(R "sha256 $HEX64.")" "sha256 $M."
eq "규칙6: 섞인 45자 base64" "$(R "blob $B64 x")" "blob $M x"
eq "규칙6: / 와 + 섞인 41자(AWS 모양)" "$(R "aws $AWS")" "aws $M"
eq "규칙6: / 3개 이상이지만 경로가 아닌 base64" "$(R "b $SLB")" "b $M"
eq "규칙6: 경로 토막 안의 40자 hex 는 가린다" "$(R "src/a/b/$HEX40")" "$M"
po="$(R "see example.com/hooks/x/y/$HEX40 now")"
eq "규칙6: URL 경로 안의 40자 hex 는 가린다" "$po" "see example.$M now"
eq "규칙6: URL 경로 hex 조각 없음" "$(none "$po" "${HEX40:0:12}")" 0

# --- 가리면 안 되는 것 ----------------------------------------------------------
for s in "a1b2c3d" "a1b2c3d4e5f6" "$HEX39" \
         "src/frontend/packages/shared/src/components/AgDataGrid" \
         "docs/guide/FrontEnd/standard-v2/part-b-shared-policy" \
         "한글 문장은 그대로 둔다 — 가나다라" "the token is valid" "tokens: 1200" "max_tokens: 4096" \
         "↓ 12.3k tokens" "PATH=/usr/bin:/bin" "12:30:45 done" "$(rep xyz 15)" "$(rep = 50)" \
         "the password is secret" "Authorization header missing"; do
  eq "가리지 않음: ${s:0:40}" "$(R "$s")" "$s"
done

# --- 한 줄에 여러 비밀 ------------------------------------------------------------
multi="a=$SK1 b $JWT password=$HEX40 Bearer $B64 x $PAT y $AWS"
mo="$(R "$multi")"
eq "여러 비밀: 결과" "$mo" "a=$M b $M password=$M Bearer $M x $M y $M"
for sec in "$SK1" "$JWT" "$HEX40" "$B64" "$PAT" "$AWS" "${SK1:3:16}" "${HEX40:0:20}"; do
  eq "여러 비밀: 원본 조각 없음(${sec:0:8}…)" "$(none "$mo" "$sec")" 0
done
eq "가림은 두 번 해도 같다(멱등)" "$(R "$mo")" "$mo"

# --- 화면 필터: ANSI·제어 문자 -----------------------------------------------------
eq "ANSI 색이 sk- 키 한가운데 있어도 가린다" "$(S "$(printf 'k sk-\033[31m%s\033[0m z' "$(rep a 24)")")" "k $M z"
eq "ANSI 색이 JWT 안에 있어도 가린다" "$(S "$(printf '%s\033[1m%s' "${JWT:0:10}" "${JWT:10}")")" "$M"
eq "OSC(BEL 끝) 제거" "$(S "$(printf '\033]0;title\007hello')")" "hello"
eq "OSC(ESC \\ 끝) 제거" "$(S "$(printf '\033]8;;http://x\033\\link\033]8;;\033\\')")" "link"
eq "끝나지 않은 OSC 는 줄 끝까지 버림" "$(S "$(printf 'ok \033]0;%s' "$SK1")")" "ok"
eq "ESC ( B 문자셋 지정 제거" "$(S "$(printf 'a\033(Bb')")" "ab"
eq "줄 중간 CR 은 그 앞을 버림" "$(S "$(printf 'old %s\rnew line' "$SK1")")" "new line"
eq "줄 끝 CR 제거" "$(printf 'abc\r\n' | console_screen_filter)" "abc"
eq "C0·DEL 제거, 탭은 둔다" "$(S "$(printf 'a\001b\177c\td')")" "$(printf 'abc\td')"
eq "C1(U+0085) 제거" "$(S "$(printf 'a\302\205b')")" "ab"
eq "NUL 제거" "$(printf 'a\000b\n' | console_screen_filter)" "ab"
eq "줄 끝 공백 제거" "$(printf 'abc   \t\n' | console_screen_filter | od -An -c | tr -d ' \n')" 'abc\n'
ko="한글 화면 — 가림 없음 ✓ 테스트"
eq "한글이 깨지지 않는다" "$(S "$ko")" "$ko"
eq "한글 사이의 ANSI 도 지운다" "$(S "$(printf '한\033[32m글')")" "한글"

# --- 화면 필터: 줄 자르기·줄 수·바이트 ------------------------------------------------
eq "400자 초과 줄은 400자(코드포인트)로" "$(S "$(rep x 450)")" "$(rep x 400)"
eq "한글 450자도 400자(1200바이트)로 깨지지 않게" "$(S "$(rep 가 450)" | wc -c | tr -d ' ')" 1201
eq "한글 400자 내용" "$(S "$(rep 가 450)")" "$(rep 가 400)"
straddle="$(rep x 380) $HEX64 tail"
so="$(S "$straddle")"
eq "400자 경계에 걸친 hex 도 앞 조각이 남지 않는다" "$(none "$so" "${HEX64:0:12}")" 0
eq "400자 경계: 앞부분은 그대로" "${so:0:381}" "$(rep x 380) "
seq 1 50 > "$tmp/50"
eq "41줄 이상이면 마지막 40줄만(줄 수)" "$(console_screen_filter < "$tmp/50" | wc -l | tr -d ' ')" 40
eq "41줄 이상이면 마지막 40줄만(첫 줄)" "$(console_screen_filter < "$tmp/50" | head -1)" 11
: > "$tmp/big"; for i in $(seq 1 40); do printf 'L%02d %s\n' "$i" "$(rep x 300)" >> "$tmp/big"; done
bo="$(console_screen_filter < "$tmp/big")"
eq "8KB 초과: 앞쪽 줄부터 버림(305바이트 × 26줄)" "$(printf '%s\n' "$bo" | wc -l | tr -d ' ')" 26
eq "8KB 초과: 첫 줄은 L15" "$(printf '%s\n' "$bo" | head -1 | cut -c1-3)" L15
eq "8KB 초과: 합계 8192바이트 이하" "$([ "$(printf '%s\n' "$bo" | wc -c)" -le 8192 ] && echo yes)" yes
eq "8KB 초과: 줄을 쪼개지 않음" "$(printf '%s\n' "$bo" | awk '{ if (length($0) != 304) bad++ } END { print bad + 0 }')" 0
eq "앞뒤 빈 줄은 지우고 가운데는 둔다" "$(printf '\n  \nA\n\nB\n\n\n' | console_screen_filter)" "$(printf 'A\n\nB')"
eq "빈 입력은 빈 출력" "$(printf '' | console_screen_filter; echo "rc=$?")" "rc=0"

# --- 줄 이음(터미널 폭에서 꺾인 비밀) ----------------------------------------------------
W="$(rep Ab3 20)"   # 60자, 30자 토막 둘은 각각 40자 미만
eq "꺾인 비밀: 두 토막 다 가림" "$(printf 'here %s\n%s done\n' "${W:0:30}" "${W:30}" | console_screen_filter)" "$(printf 'here %s\n%s done' "$M" "$M")"
eq "꺾인 비밀: 다음 줄 들여쓰기는 둔다" "$(printf 'k %s\n    %s\n' "${W:0:30}" "${W:30}" | console_redact_text)" "$(printf 'k %s\n    %s' "$M" "$M")"
eq "이음: 한 종류 문자 토막(긴 소문자 + 다음 줄 L02)은 잇지 않는다" "$(printf '%s\nL02 x\n' "$(rep x 45)" | console_screen_filter)" "$(printf '%s\nL02 x' "$(rep x 45)")"
eq "이음: 비밀로 끝난 줄 다음의 짧은 숫자(줄 번호)는 둔다" "$(printf 'k %s\n039 next\n' "$B64" | console_screen_filter)" "$(printf 'k %s\n039 next' "$M")"
eq "꺾이지 않은 평범한 두 줄은 그대로" "$(printf 'build ok\nnext step\n' | console_screen_filter)" "$(printf 'build ok\nnext step')"
{ printf 'x %s\n%s\n' "${W:0:30}" "${W:30}"; for i in $(seq 1 39); do echo "l$i"; done; } > "$tmp/w41"
eq "40줄 창 바로 앞 줄과의 이음도 본다" "$(console_screen_filter < "$tmp/w41" | head -1)" "$M"

# ===== 보안 리뷰 미탐 보강 ====================================================================
T24="$(rep Ab9x 6)"            # 24자 섞인 꼬리(접두어 토큰·CLI 값)
PW="Hunter$((1 + 1))pw"        # 평범한 암호 모양
H32="$(rep 0a1b2c3d 4)"        # Sentry DSN 공개 키 모양 32 hex
B64L="$(rep MIIEvQIBADANBgkq 4)"   # PEM 본문 줄 모양
ESC="$(printf '\033')"
NO() { eq "가리지 않음[$1]: ${2:0:40}" "$(R "$2")" "$2"; }   # NO <항목> <줄> — 바뀌면 안 된다
P() { printf "$1" | console_clean_prompt; echo "rc=$?"; }   # 프롬프트 정리(printf 형식 문자열로 입력)

# --- 항목 1: 공백으로 나뉜 CLI 인자·붙여 쓴 짧은 옵션 ---------------------------------------
eq "CLI: --token 값" "$(R "vercel deploy --token $T24")" "vercel deploy --token $M"
eq "CLI: --password 값" "$(R "psql --password $PW")" "psql --password $M"
eq "CLI: -u 사용자 -p 값" "$(R "docker login -u me -p $PW")" "docker login -u me -p $M"
eq "CLI: -p값(붙여 씀)" "$(R "mysql -u root -p$PW db")" "mysql -u root -p$M db"
eq "CLI: sshpass -p 값" "$(R "sshpass -p $PW ssh h")" "sshpass -p $M ssh h"
eq "CLI: curl -u x:y 의 y" "$(R "curl -u admin:$PW https://x")" "curl -u admin:$M https://x"
eq "CLI: --user=x:y 의 y" "$(R "curl --user=admin:$PW x")" "curl --user=admin:$M x"
eq "CLI: .netrc 한 줄" "$(R "machine h login u password $PW")" "machine h login u password $M"
eq "CLI: .netrc 여러 줄 형식(줄 처음 password)" "$(R "  password $PW")" "  password $M"
eq "CLI: keytool -storepass 값" "$(R "keytool -list -storepass $PW")" "keytool -list -storepass $M"
eq "CLI: --password \"따옴표 값\"" "$(R "cli --password \"my $PW\" -v")" "cli --password \"$M\" -v"
eq "CLI: --api-key 값" "$(R "x --api-key $PW")" "x --api-key $M"
NO 1 "ls -p"
NO 1 "docker run -p 8080:80 nginx"
NO 1 "ssh -p 2222 host"
NO 1 "ps -p 8080"
NO 1 "mkdir -p src/foo/bar"
NO 1 "find . -path ./x -prune -o -print"
NO 1 "gcc -pthread -o a a.c"
NO 1 "  -p, --password string   Password to use"
NO 1 "docker login -u me"
NO 1 "please enter the password below"
NO 1 "--password-stdin -u me"

# --- 항목 2: 이름 목록 누락 -------------------------------------------------------------
eq "이름: DB_PASS=" "$(R "DB_PASS=$PW")" "DB_PASS=$M"
eq "이름: SMTP_PASS:" "$(R "SMTP_PASS: $PW")" "SMTP_PASS: $M"
eq "이름: PW:" "$(R "PW: x")" "PW: $M"
eq "이름: db_pw=" "$(R "db_pw=x")" "db_pw=$M"
eq "이름: ID/PW: a/b" "$(R "ID/PW: admin/1234")" "ID/PW: $M"
eq "이름: GPG_PASSPHRASE=" "$(R "GPG_PASSPHRASE=x")" "GPG_PASSPHRASE=$M"
eq "이름: ENCRYPTION_KEY=(16자)" "$(R "ENCRYPTION_KEY=$(rep ab12 4)")" "ENCRYPTION_KEY=$M"
eq "이름: JWT_SIGNING_KEY=" "$(R "JWT_SIGNING_KEY=x")" "JWT_SIGNING_KEY=$M"
eq "이름: MASTER_KEY=" "$(R "MASTER_KEY=x")" "MASTER_KEY=$M"
eq "이름: STRIPE_KEY=sk_live_" "$(R "STRIPE_KEY=sk_live_$T24")" "STRIPE_KEY=$M"
eq "이름: camelCase dbPw" "$(R "dbPw: x")" "dbPw: $M"
eq "이름: camelCase …Key 는 따옴표 값이면 가린다(JSON)" "$(R "{\"encryptionKey\": \"$PW\"}")" "{\"encryptionKey\": \"$M\"}"
eq "이름: camelCase …Key 는 따옴표 값이면 가린다(=)" "$(R "const signingKey = '$PW'")" "const signingKey = '$M'"
NO 2 "rowKey={row.id} masterKey: cfg.master"
eq "이름: 비교(==)라도 따옴표 값은 가린다" "$(R "if password == \"$PW\":")" "if password == \"$M\":"
NO 2 "const { data } = useQuery({ queryKey: ['users', id] })"
NO 2 "  key: value"
NO 2 "if (session.user.id === authorId) return"
NO 2 "if (password != null) ok"
eq "이름: Cookie 헤더 줄 나머지" "$(R "Cookie: sid=$(rep a1 10); theme=dark")" "Cookie: $M"
eq "이름: JSON auth" "$(R "{\"auth\":\"$(rep QWxh 6)==\"}")" "{\"auth\":\"$M\"}"
eq "이름: Authorization= (= 구분)" "$(R "Authorization=Basic $(rep QWxh 5)")" "Authorization=$M"
eq "이름: API 키:" "$(R "API 키: $(rep a1 10)")" "API 키: $M"
eq "이름: 인증키=" "$(R "인증키=abc")" "인증키=$M"
eq "이름: 비밀 키:" "$(R "비밀 키: abc")" "비밀 키: $M"
eq "이름: SAS sig=(% 포함)" "$(R "https://a.blob.core.windows.net/c/b?sv=2021&sig=AbC%2Bd%3D&se=1")" "https://a.blob.core.windows.net/c/b?sv=2021&sig=$M"
eq "이름: session_id=" "$(R "session_id=abc")" "session_id=$M"
NO 2 "public_key: ssh-rsa AAAA in the file"
NO 2 "isPublicKey: true"
NO 2 "monkey: banana"
NO 2 "author: kim"
NO 2 "compass: north"
NO 2 "--- PASS: TestFoo (0.00s)"
NO 2 "단축키: Ctrl+C"
NO 2 "password-less login is enabled"
NO 2 "npm_config_cache=/tmp/npm"

# --- 항목 3: 접두어가 뚜렷한 40자 미만 토큰 ----------------------------------------------------
for pf in AIza glpat- gldt- hf_ GOCSPX- sk_live_ sk_test_ rk_live_ rk_test_ whsec_ xoxb- xoxp- ghp_ gho_ ghs_ github_pat_ npm_ sbp_ sb_secret_; do
  eq "접두어: $pf" "$(R "k ${pf}$T24 z")" "k $M z"
done
eq "접두어: AKIA+16" "$(R "id AKIA$(rep AB2C 4) z")" "id $M z"
eq "접두어: ASIA+16" "$(R "id ASIA$(rep XY7Z 4) z")" "id $M z"
eq "접두어: 단어 중간도 가린다" "$(R "x=abc${T24:0:2}ghp_$T24")" "x=abc${T24:0:2}$M"
eq "접두어: URL 사용자 칸의 glpat-" "$(R "git clone https://glpat-$T24@gitlab.com/g/r.git")" "git clone https://$M@gitlab.com/g/r.git"
NO 3 "npm_config_registry_url_long_name"
NO 3 "global-settings-directory-name"
NO 3 "hf_hub_download_function_name"
NO 3 "AKIA short"
NO 3 "laughs_out_loud_forever_and_ever"

# --- 항목 4: 구분자·구조가 다른 키·값 ---------------------------------------------------------
eq "구조: PHP define(,)" "$(R "define( 'DB_PASSWORD', '$PW' );")" "define( 'DB_PASSWORD', '$M' );"
eq "구조: config[\"password\"] =" "$(R "config[\"password\"] = \"$PW\"")" "config[\"password\"] = \"$M\""
eq "구조: ENV['API_KEY']=" "$(R "ENV['API_KEY']='x'")" "ENV['API_KEY']='$M'"
eq "구조: os.environ[\"SECRET_KEY\"]=" "$(R "os.environ[\"SECRET_KEY\"]=\"x\"")" "os.environ[\"SECRET_KEY\"]=\"$M\""
eq "구조: setPassword(\"값\")" "$(R "user.setPassword(\"$PW\")")" "user.setPassword(\"$M\")"
eq "구조: 전각 콜론" "$(R "password：x")" "password：$M"
eq "구조: 전각 등호" "$(R "PASSWORD＝x")" "PASSWORD＝$M"
eq "구조: YAML 블록(|)" "$(printf 'db:\n  password: |\n    one\n    two\n\n  user: kim\n' | console_redact_text)" "$(printf 'db:\n  password: %s\n    %s\n    %s\n\n  user: kim' "$M" "$M" "$M")"
eq "구조: YAML 빈 값 + 깊은 줄" "$(printf 'secret_key:\n  %s\nother: 1\n' "$PW" | console_redact_text)" "$(printf 'secret_key:\n  %s\nother: 1' "$M")"
eq "구조: YAML 블록(>-)·줄 번호 접두" "$(printf '     3\ttoken: >-\n     4\t  abc\n     5\tname: x\n' | console_redact_text)" "$(printf '     3\ttoken: %s\n     4\t  %s\n     5\tname: x' "$M" "$M")"
NO 4 "checkPassword(input)"
NO 4 "print(\"token\")"
NO 4 "user, password and email are required"
eq "가리지 않음[4]: YAML tokens 블록" "$(printf 'tokens:\n  input: 1200\n' | console_redact_text)" "$(printf 'tokens:\n  input: 1200')"

# --- 항목 5: URL·DB 접속 문자열 암호 ----------------------------------------------------------
eq "URL: 인코딩 안 된 특수문자 암호(마지막 @)" "$(R "postgres://admin:pa#ss/w0rd@db.example.com:5432/app")" "postgres://admin:$M@db.example.com:5432/app"
eq "URL: Sentry DSN(: 없는 사용자 칸)" "$(R "https://$H32@o1.ingest.sentry.io/45")" "https://$M@o1.ingest.sentry.io/45"
eq "DB: jdbc:oracle:thin:u/p@h" "$(R "jdbc:oracle:thin:scott/Tiger123@dbhost:1521:ORCL")" "jdbc:oracle:thin:scott/$M@dbhost:1521:ORCL"
eq "DB: sqlplus u/p@db" "$(R "sqlplus scott/Tiger123@ORCL")" "sqlplus scott/$M@ORCL"
eq "DB: expdp u/p(@ 없음)" "$(R "expdp system/manager1 directory=d")" "expdp system/$M directory=d"
NO 5 "git@github.com:org/repo.git"
NO 5 "mail kim@example.com now"
NO 5 "ssh user@host"
NO 5 "pnpm add @dk-oasis/shared@0.1.0 @mantine/core@9.0.0"
NO 5 "go install golang.org/x/tools/gopls@latest"
NO 5 "docker pull library/nginx@sha256:abc"
NO 5 "  uses: actions/checkout@v4"
NO 5 "pip install foo/bar@1.2.3"
NO 5 "https://medium.com/@user/post"
NO 5 "ssh://git@github.com/org/repo"
NO 5 "http://host:8080/a/@b"

# --- 한 줄에 여러 비밀·ANSI(새 규칙) ------------------------------------------------------------
mx="psql --password $PW DB_PASS=abc ghp_$T24 postgres://a:b1@h/db sqlplus s/t1@o"
eq "새 규칙 여러 비밀: 결과" "$(R "$mx")" "psql --password $M DB_PASS=$M $M postgres://a:$M@h/db sqlplus s/$M@o"
eq "새 규칙 여러 비밀: 멱등" "$(R "$(R "$mx")")" "$(R "$mx")"
eq "ANSI: --token 값 사이 색" "$(S "vercel --token ${ESC}[1m$T24${ESC}[0m")" "vercel --token $M"
eq "ANSI: 접두어 토큰 한가운데 색" "$(S "k glpat-${T24:0:8}${ESC}[31m${T24:8}${ESC}[0m z")" "k $M z"
eq "ANSI: 이름 한가운데 색" "$(S "DB_${ESC}[31mPASS${ESC}[0m=abc")" "DB_PASS=$M"
eq "ANSI: URL 암호 색" "$(S "postgres://a:${ESC}[1mpw1${ESC}[0m@h/db")" "postgres://a:$M@h/db"

# --- 항목 6: 여러 줄에 걸친 비밀 ---------------------------------------------------------------
eq "이음: cat -n 줄 번호 접두를 건너뛴다" "$(printf '     4\tk %s\n     5\t%s rest\n' "${W:0:30}" "${W:30}" | console_redact_text)" "$(printf '     4\tk %s\n     5\t%s rest' "$M" "$M")"
eq "이음: 4: 접두를 건너뛴다" "$(printf '4: k %s\n5: %s rest\n' "${W:0:30}" "${W:30}" | console_redact_text)" "$(printf '4: k %s\n5: %s rest' "$M" "$M")"
eq "이음: 표 테두리 │ 를 건너뛴다" "$(printf '│ k %s │\n│ %s rest │\n' "${W:0:30}" "${W:30}" | console_screen_filter)" "$(printf '│ k %s │\n│ %s rest │' "$M" "$M")"
# PEM 머리·꼬리도 조립한다(저장소에 개인 키 머리 모양을 그대로 남기지 않는다)
D5="$(rep - 5)"; PK="PRIV""ATE KEY"
PB="${D5}BEGIN RSA $PK$D5"; PE="${D5}END RSA $PK$D5"
eq "PEM: BEGIN~END 줄 전부" "$(printf 'a\n%s\n%s\n%s\n%s\nb\n' "$PB" "$B64L" "${B64L:0:9}" "$PE" | console_screen_filter)" "$(printf 'a\n%s\n%s\n%s\n%s\nb' "$M" "$M" "$M" "$M")"
eq "PEM: END 없으면 입력 끝까지" "$(printf 'a\n%s\n%s\nmore text\n' "${D5}BEGIN OPENSSH $PK$D5" "$B64L" | console_redact_text)" "$(printf 'a\n%s\n%s\n%s' "$M" "$M" "$M")"
eq "PEM: END 만 있으면 그 줄과 위의 base64 줄" "$(printf 'hello world\n%s\nAb==\n%s\nok\n' "$B64L" "${D5}END $PK$D5" | console_redact_text)" "$(printf 'hello world\n%s\n%s\n%s\nok' "$M" "$M" "$M")"
eq "PEM: 한 줄 안(JSON 이스케이프)" "$(R "\"k\": \"${D5}BEGIN $PK$D5\\n$B64L\\n${D5}END $PK$D5\\n\", \"x\": 1")" "\"k\": \"$M\\n\", \"x\": 1"
NO 6 "${D5}BEGIN CERTIFICATE$D5"
L42="$(rep Ab3 14)"   # 42자, 혼자 가려진다
eq "이음ⓒ: 앞 줄 끝이 긴 비밀이면 다음 줄 짧은 꼬리도" "$(printf 'k %s\nabcdefgh\ndone now\n' "$L42" | console_screen_filter)" "$(printf 'k %s\n%s\ndone now' "$M" "$M")"
eq "이음ⓒ: 다음 줄이 숫자만이면 둔다" "$(printf 'k %s\n12345 x\n' "$L42" | console_redact_text)" "$(printf 'k %s\n12345 x' "$M")"
eq "이음ⓒ: 다음 줄 첫 토막 뒤가 : 이면 둔다" "$(printf 'k %s\nnote: x\n' "$(rep a1 20)" | console_redact_text)" "$(printf 'k %s\nnote: x' "$M")"
{ for i in 1 2 3 4; do echo "l$i"; done; echo "password: |"; echo "  $PW"; for i in $(seq 1 39); do echo "m$i"; done; } > "$tmp/w45"
eq "창ⓓ: 45줄 입력이면 40줄만 낸다" "$(console_screen_filter < "$tmp/w45" | wc -l | tr -d ' ')" 40
eq "창ⓓ: 창 앞 한 줄(YAML 이름)이 창 첫 줄을 가린다" "$(console_screen_filter < "$tmp/w45" | head -1)" "  $M"
{ for i in 1 2 3; do echo "l$i"; done; echo "password: |"; echo "  v1"; echo "  v2"; for i in $(seq 1 39); do echo "m$i"; done; } > "$tmp/w45b"
eq "창ⓓ: 41줄 창보다 앞 줄은 보지 않는다(폴러가 41줄을 넘겨야 하는 이유)" "$(console_screen_filter < "$tmp/w45b" | head -1)" "  v2"

# --- 항목 7·조정자: 긴 줄 자르기·성능 -----------------------------------------------------------
X1990="$(rep x 1990)"
eq "자름: 잘린 끝이 sk- 앞부분(9자)이면 가린다" "$(R "$X1990 sk-ab12cdefghijklmnopq" | tail -c 10)" " $M"
eq "자름: 잘린 끝 12자 이상 영숫자 토큰은 가린다" "$(R "${X1990:0:1985} $T24" | tail -c 10)" " $M"
eq "자름: 잘린 끝 평범한 짧은 단어는 둔다" "$(R "${X1990:0:1993} hello world" | tail -c 11)" " hello wor"
eq "자름: 2000바이트·UTF-8 글자를 쪼개지 않는다" "$(R "$(rep 'ab ' 666)가나" | wc -c | tr -d ' ')" 1999
eq "자름: 화면에서 잘린 꼬리 조각이 남지 않는다" "$(none "$(S "$X1990 sk-ab12cdefghijklmnopq")" "sk-ab")" 0
eq "총량: 가림 입력 1MB 초과는 실패·출력 없음" "$(rep 'xxxxxxx ' 140000 | console_redact_text | wc -c | tr -d ' '; echo "rc=${PIPESTATUS[1]}")" "$(printf '0\nrc=71')"
eq "프롬프트: 한 줄 8000바이트 초과는 바로 3" "$(rep xxxxxxxx 1001 | console_clean_prompt; echo "rc=$?")" "rc=3"
# timed <함수> <입력 파일> — 새 프로세스 그룹에서 lib 의 <함수> 를 돌려 "<pgid> <rc> <ms>" 를 낸다.
# 5초를 넘으면 그룹째 끄고 rc 142(node 가 새 프로세스 그룹으로 띄우고 시간을 잰다). 그룹 번호는 PGIDS 에 모아 끝에 남은 프로세스를 확인·정리한다.
timed() {
  node -e '
    const cp = require("child_process"), fs = require("fs");
    const [fn, inp, lib] = process.argv.slice(1); const t0 = Date.now();
    const fd = fs.openSync(inp, "r");
    const c = cp.spawn("bash", ["-c", ". \"$0\"; $1", lib, fn], { detached: true, stdio: [fd, "ignore", "inherit"] });
    const out = (rc) => { process.stdout.write(c.pid + " " + rc + " " + (Date.now() - t0) + "\n"); };
    const tm = setTimeout(() => { try { process.kill(-c.pid, "SIGTERM"); } catch (e) {} out(142); process.exit(0); }, 5000);
    c.on("exit", (code, sig) => { clearTimeout(tm); out(code === null ? 128 + require("os").constants.signals[sig] : code); });
    c.on("error", () => { clearTimeout(tm); out(127); });
  ' "$1" "$2" "$LIB"
}
for kind in eyJ sk- token= Ab3Cd9 가 'a://'; do
  nb="$(printf '%s' "$kind" | wc -c | tr -d ' ')"
  rep "$kind" $((65000 / nb)) > "$tmp/long"; echo >> "$tmp/long"
  read -r g rc ms <<< "$(timed console_screen_filter "$tmp/long")"; PGIDS="$PGIDS $g"
  eq "성능: '$kind' 반복 65000바이트 한 줄 화면 필터 1초 안(${ms}ms)" "$rc:$([ "${ms:-9999}" -lt 1000 ] && echo fast)" "0:fast"
done
rep eyJ 20000 > "$tmp/jwt"; echo >> "$tmp/jwt"
read -r g rc ms <<< "$(timed console_redact_text "$tmp/jwt")"; PGIDS="$PGIDS $g"
eq "성능: eyJ 2만 번 한 줄 console_redact_text 3초 안(${ms}ms)" "$rc:$([ "${ms:-9999}" -lt 3000 ] && echo fast)" "0:fast"
left=""; for g in $PGIDS; do compat_pgroup_alive "$g" && { left="$left $g"; compat_kill_pgroup "$g"; }; done
eq "성능: 시간 제한 시험 뒤 남은 자식 프로세스 없음" "${left:-none}" none

# --- 항목 8: 보이지 않는 문자 -------------------------------------------------------------------
eq "보이지 않음: ZWSP 가 sk- 키 안에 있어도 가린다" "$(S "$(printf 'k sk-%s\342\200\213%s z' "$(rep a 10)" "$(rep a 14)")")" "k $M z"
eq "보이지 않음: BOM·soft hyphen·결합 문자·RLO 제거" "$(S "$(printf '\357\273\277pa\302\255ss\314\201word\342\200\256: x')")" "password: $M"
eq "보이지 않음: U+2060 이 이름 안에 있어도" "$(S "$(printf 'to\342\201\240ken=abc')")" "token=$M"
eq "프롬프트: RLO·ZWSP 제거" "$(P 'a\342\200\256b\342\200\213c')" "$(printf 'abc\nrc=0')"
eq "프롬프트: Unicode 공백만이면 1" "$(P '\302\240\343\200\200\342\200\203 ')" "rc=1"
eq "프롬프트: NBSP 가 섞인 글은 정상" "$(P 'a\302\240b')" "$(printf 'a\302\240b\nrc=0')"

# --- 실패 시 아무것도 내지 않는다 ---------------------------------------------------------
mkdir -p "$tmp/shim"
printf '#!/bin/sh\necho partial\nexit 2\n' > "$tmp/shim/awk"; chmod +x "$tmp/shim/awk"
ln -s "$(command -v tr)" "$tmp/shim/tr"
fo="$(printf 'secret %s\n' "$SK1" | PATH="$tmp/shim" console_redact_text)"; frc=$?
eq "awk 실패: console_redact_text 비정상 종료" "$([ "$frc" -ne 0 ] && echo nz)" nz
eq "awk 실패: stdout 비어 있음" "$fo" ""
fo="$(printf 'secret %s\n' "$SK1" | PATH="$tmp/shim" console_screen_filter)"; frc=$?
eq "awk 실패: console_screen_filter 비정상 종료·출력 없음" "$frc:$fo" "2:"
fo="$(printf 'hello' | PATH="$tmp/shim" console_clean_prompt)"; frc=$?
eq "awk 실패: console_clean_prompt 는 4·출력 없음" "$frc:$fo" "4:"

# --- console_screen_sha -------------------------------------------------------------------
h1="$(printf 'line a\nline b\n' | console_screen_sha)"
h2="$(printf 'line a\nline b\n' | console_screen_sha)"
h3="$(printf 'line a\nline c\n' | console_screen_sha)"
eq "sha: 64자 hex" "$(printf '%s' "$h1" | grep -cE '^[0-9a-f]{64}$')" 1
eq "sha: 같은 입력이면 같은 값" "$h1" "$h2"
eq "sha: 다른 입력이면 다른 값" "$([ "$h1" != "$h3" ] && echo diff)" diff
eq "sha: 알려진 값(빈 입력)" "$(printf '' | console_screen_sha)" e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
mkdir -p "$tmp/shaonly"
if command -v openssl >/dev/null 2>&1; then
  ln -s "$(command -v openssl)" "$tmp/shaonly/openssl"
  eq "sha: openssl 대체 경로도 같은 값" "$(printf 'line a\nline b\n' | PATH="$tmp/shaonly" console_screen_sha)" "$h1"
fi
eq "sha: 도구가 없으면 종료 코드 1" "$(printf 'x' | PATH="$tmp/empty-path" console_screen_sha; echo "rc=$?")" "rc=1"

# --- console_clean_prompt -----------------------------------------------------------------
P() { printf "$1" | console_clean_prompt; echo "rc=$?"; }   # printf 형식 문자열로 입력
eq "프롬프트: 정상(0)" "$(P 'hello world')" "$(printf 'hello world\nrc=0')"
eq "프롬프트: 줄바꿈은 공백(a\\nb → a b)" "$(P 'a\nb')" "$(printf 'a b\nrc=0')"
eq "프롬프트: CRLF 는 공백 둘(접지 않음)" "$(P 'a\r\nb')" "$(printf 'a  b\nrc=0')"
eq "프롬프트: 탭은 공백" "$(P 'a\tb')" "$(printf 'a b\nrc=0')"
eq "프롬프트: U+2028·U+2029 는 공백" "$(P 'a\342\200\250b\342\200\251c')" "$(printf 'a b c\nrc=0')"
eq "프롬프트: C0·DEL·C1·ESC 제거" "$(P 'a\001b\177c\302\205d\033e')" "$(printf 'abcde\nrc=0')"
eq "프롬프트: 앞뒤 공백 제거·가운데 연속 공백은 둔다" "$(P '  a   b  \n')" "$(printf 'a   b\nrc=0')"
eq "프롬프트: 한글 보존" "$(P '안녕\n하세요')" "$(printf '안녕 하세요\nrc=0')"
eq "프롬프트: 빈 결과(1)·출력 없음" "$(P '  \n\t\r ')" "rc=1"
eq "프롬프트: 제어 문자만(1)" "$(P '\001\002')" "rc=1"
eq "프롬프트: ! 포함(2)·출력 없음" "$(P 'run this!')" "rc=2"
eq "프롬프트: 2000자 정확히는 정상" "$(rep 가 2000 | console_clean_prompt | wc -c | tr -d ' ')" 6001
eq "프롬프트: 2001자(3)·출력 없음" "$(rep 가 2001 | console_clean_prompt; echo "rc=$?")" "rc=3"
eq "프롬프트: 32KB 넘는 원문은 바로 3" "$(rep xxxxxxxx 4200 | console_clean_prompt; echo "rc=$?")" "rc=3"
eq "가림: 64KB 넘는 줄도 2000바이트로 먼저 잘라 가린다(거절 아님)" "$(rep xxxxxxxx 8200 | console_redact_text; echo "rc=$?")" "$(printf '%s\nrc=0' "$M")"
eq "화면: 64KB 넘는 줄도 2000바이트로 먼저 잘라 가린다(거절 아님)" "$(rep xxxxxxxx 8200 | console_screen_filter; echo "rc=$?")" "$(printf '%s\nrc=0' "$M")"
eq "프롬프트: 빈 입력(1)" "$(printf '' | console_clean_prompt; echo "rc=$?")" "rc=1"

# --- GNU awk 로 한 번 더 ------------------------------------------------------------------
if [ -z "${CONSOLE_REDACT_ALT_AWK:-}" ] && command -v gawk >/dev/null 2>&1; then
  mkdir -p "$tmp/gawk"; ln -s "$(command -v gawk)" "$tmp/gawk/awk"
  if CONSOLE_REDACT_ALT_AWK=1 PATH="$tmp/gawk:$PATH" bash "$0" > "$tmp/gawk.out" 2>&1; then chk ok "gawk 로 같은 시험 통과"
  else chk fail "gawk 로 같은 시험" "$(grep -E '^FAIL' "$tmp/gawk.out" | head -3)"; fi
fi

echo "통과 $pass · 실패 $fail"
[ "$fail" -eq 0 ]
