#!/usr/bin/env bash
# be-run.sh 가 한 모듈만 다시 띄워도 같은 체크아웃의 다른 모듈을 내리지 않는지 보는 회귀 시험(2026-10-09, jsched-tx-8).
# 진짜 앱 대신 작은 HTTP 서버(FakeApp)를 모듈로 쓰고, be-run.sh 와 scripts/lib 를 임시 폴더에 복사해 포트를 +30000 으로 바꾼다
# (38092~38191). 이 체크아웃의 서버·DB·Gradle 을 쓰지 않는다. 사용: scripts/tests/be-run-restart.sh
# 환경변수: BE_RUN_SRC=<be-run.sh 판>(시험 대상 판 바꾸기), OLD_BE_RUN_SRC=<소유 기록 없는 예전 판>(있으면 7단계를 더 돈다).
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
tmp="$(cd "$(mktemp -d)" && pwd -P)"   # 물리 경로: macOS 의 /var 심링크 때문에 lsof 의 cwd 가 ROOT_DIR 와 달라지는 것을 막는다
root="$tmp/root"
fail=0
pids_to_kill=""

note() { printf '%s\n' "$*"; }
bad() { printf 'FAIL: %s\n' "$*"; fail=1; }
cleanup() {
  for p in $pids_to_kill; do kill -TERM "$p" 2>/dev/null || true; done
  sleep 1
  # 남은 앱 JVM 은 이 임시 폴더 아래 작업 디렉터리를 가진 것만 정리한다
  for p in $(pgrep -f FakeApp 2>/dev/null || true); do
    cwd="$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    case "$cwd" in "$tmp"/*|"/private$tmp"/*) kill -KILL "$p" 2>/dev/null || true ;; esac
  done
  rm -rf "$tmp"
}
trap cleanup EXIT
( sleep 600 >/dev/null 2>&1; echo "FAIL: 시험 전체 600초 상한 초과"; kill -TERM $$ ) & watchdog=$!
trap 'kill $watchdog 2>/dev/null; wait $watchdog 2>/dev/null; cleanup' EXIT

mkdir -p "$root/scripts" "$tmp/app"
cp "${BE_RUN_SRC:-$repo/be-run.sh}" "$root/be-run.sh"   # BE_RUN_SRC: 다른 판(예: 수정 전)으로 시험해 볼 때
cp -R "$repo/scripts/lib" "$root/scripts/lib"
cp "${LOCAL_RUN_SRC:-$repo/local-run.sh}" "$root/local-run.sh"   # LOCAL_RUN_SRC: 다른 판으로 시험해 볼 때
printf '#!/usr/bin/env bash\nexec sleep 300\n' > "$root/fe-run.sh"; chmod +x "$root/fe-run.sh"   # local-run 이 띄울 가짜 프론트
printf 'BE_RUN_ARGS="--mcm --mdm"\n' > "$root/.run.env"
sed -i.bak -E 's/^(be +[a-z]+ +)([0-9]+)/\1__\2/' "$root/scripts/lib/modules.conf"
for p in 8092 8093 8094 8095 8096 8100 8191; do
  sed -i.bak "s/__$p/$((p + 30000))/" "$root/scripts/lib/modules.conf"
done
rm -f "$root/scripts/lib/modules.conf.bak"

cat > "$tmp/app/FakeApp.java" <<'JAVA'
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.file.*;
public class FakeApp {
    public static void main(String[] a) throws Exception {
        int port = Integer.parseInt(Files.readString(Path.of("port.txt")).trim());
        String m = System.getProperty("be.run.module", "?");
        HttpServer s = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        s.createContext("/", x -> { byte[] b = ("ok " + m).getBytes(); x.sendResponseHeaders(200, b.length); x.getResponseBody().write(b); x.close(); });
        s.start();
        Thread.currentThread().join();
    }
}
JAVA
"$JAVA_HOME/bin/javac" -d "$tmp/app" "$tmp/app/FakeApp.java" || { echo "FAIL: javac"; exit 1; }

declare_port() { case "$1" in mcm) echo 38100 ;; mdm) echo 38096 ;; analog) echo 38191 ;; esac; }
for m in mcm mdm analog; do
  d="$root/src/backend/$m"
  mkdir -p "$d/api/build/be-run"
  # classpath 에 root/src 경로를 하나 넣는다: local-run 의 잔존 프로세스 정리가 명령줄에 이 경로가 든 프로세스를 쓸어 담는다.
  printf 'FakeApp\n%s\n' "$tmp/app:$root/src/backend/lib" > "$d/api/build/be-run/classpath.txt"
  cp "$d/api/build/be-run/classpath.txt" "$tmp/cp-$m"
  declare_port "$m" > "$d/port.txt"
  if lsof -nP -tiTCP:"$(declare_port "$m")" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "FAIL: 시험 포트 $(declare_port "$m") 가 이미 쓰이고 있다"; exit 1
  fi
done

# 가짜 gradlew: 8초 걸린 뒤 classpath.txt 를 다시 만든다(빌드 전용 실행을 오래 붙들어 두려는 용도)
cat > "$root/src/backend/gradlew" <<GRADLE
#!/bin/sh
sleep 8
for m in mcm mdm analog; do
  mkdir -p "$root/src/backend/\$m/api/build/be-run"
  cp "$tmp/cp-\$m" "$root/src/backend/\$m/api/build/be-run/classpath.txt"
done
GRADLE
chmod +x "$root/src/backend/gradlew"

run() { BE_PREBUILD=0 bash "$root/be-run.sh" "$@"; }
# 백그라운드용: 함수를 &로 부르면 서브셸이 한 겹 더 생겨 $! 가 be-run 의 pid 가 아니므로 exec 로 바꾼다.
runbg() { BE_PREBUILD=0 exec bash "$root/be-run.sh" "$@"; }
port_pid() { lsof -nP -tiTCP:"$(declare_port "$1")" -sTCP:LISTEN 2>/dev/null | head -n 1; }
up() { curl -fsS --max-time 2 "http://127.0.0.1:$(declare_port "$1")/" >/dev/null 2>&1; }
wait_up() { for _ in $(seq 1 60); do up "$1" && return 0; sleep 0.5; done; return 1; }
wait_down() { for _ in $(seq 1 60); do up "$1" || return 0; sleep 0.5; done; return 1; }
alive() { kill -0 "$1" 2>/dev/null; }

# ── 1) mcm·mdm·analog 를 한 be-run(A)으로 띄운다 ──
runbg --mcm --mdm --analog >"$tmp/A.log" 2>&1 & A=$!
pids_to_kill="$A"
for m in mcm mdm analog; do wait_up "$m" || bad "A: $m 가 뜨지 않았다"; done
mdm1="$(port_pid mdm)"; analog1="$(port_pid analog)"; mcm1="$(port_pid mcm)"
note "1) A(pid $A) 기동: mcm=$mcm1 mdm=$mdm1 analog=$analog1"

# ── 2) 드라이런은 아무것도 끄지 않고 가져올 모듈을 보인다 ──
run --mcm --dry-run >"$tmp/dry.log" 2>&1
grep -q "앱 JVM pid $mcm1 만 내린다" "$tmp/dry.log" || bad "드라이런이 mcm 의 가져올 JVM 을 안 보였다"
up mcm && up mdm && up analog || bad "드라이런이 서버를 건드렸다"
note "2) 드라이런 OK"

# ── 3) mcm 만 다시 띄운다(B) → mdm·analog 는 살아 있어야 한다 ──
runbg --mcm >"$tmp/B.log" 2>&1 & B=$!
pids_to_kill="$pids_to_kill $B"
for _ in $(seq 1 60); do mcm2="$(port_pid mcm)"; [ -n "$mcm2" ] && [ "$mcm2" != "$mcm1" ] && up mcm && break; sleep 0.5; done
[ -n "${mcm2:-}" ] && [ "$mcm2" != "$mcm1" ] || bad "B: mcm 가 새 JVM 으로 바뀌지 않았다"
[ "$(port_pid mdm)" = "$mdm1" ] && up mdm || bad "B 가 mdm 을 내렸다"
[ "$(port_pid analog)" = "$analog1" ] && up analog || bad "B 가 analog 을 내렸다"
alive "$A" || bad "A be-run 이 끝났다(남은 모듈이 있으니 살아 있어야 한다)"
note "3) mcm 재기동: mcm $mcm1 → $mcm2, mdm·analog 유지, A 생존"

# ── 4) A 를 끝낸다 → A 가 맡은 mdm·analog 만 내려가고 B 의 mcm 은 산다 ──
kill -TERM "$A"; wait "$A" 2>/dev/null
wait_down mdm || bad "A 종료 뒤 mdm 이 안 내려갔다"
wait_down analog || bad "A 종료 뒤 analog 이 안 내려갔다"
[ "$(port_pid mcm)" = "$mcm2" ] && up mcm || bad "A 의 cleanup 이 B 의 mcm 을 내렸다"
note "4) A 종료: mdm·analog 내려감, B 의 mcm 유지"

# ── 5) 모듈을 전부 가져가면 이전 be-run 은 스스로 끝나고 새 JVM 은 산다 ──
runbg --mdm --analog >"$tmp/C.log" 2>&1 & C=$!
pids_to_kill="$pids_to_kill $C"
wait_up mdm || bad "C: mdm 안 뜸"; wait_up analog || bad "C: analog 안 뜸"
runbg --mdm --analog >"$tmp/D.log" 2>&1 & D=$!
pids_to_kill="$pids_to_kill $D"
for _ in $(seq 1 40); do alive "$C" || break; sleep 0.5; done
alive "$C" && bad "C 의 모듈을 D 가 모두 가져갔는데 C 가 끝나지 않았다"
sleep 1
up mdm && up analog || bad "C 의 cleanup 이 D 의 모듈을 내렸다"
[ "$(port_pid mcm)" = "$mcm2" ] && up mcm || bad "mcm(B)이 영향을 받았다"
note "5) 전부 가져가기: C 종료, D 의 mdm·analog 유지, B 의 mcm 유지"

# ── 6) 전부 끝내면 서버·소유 기록이 남지 않는다 ──
kill -TERM "$B" "$D" 2>/dev/null; wait "$B" "$D" 2>/dev/null
for m in mcm mdm analog; do wait_down "$m" || bad "마무리 뒤 $m 이 남았다"; done
ls "$root/.be-run"/*.own >/dev/null 2>&1 && bad "소유 기록이 남았다: $(ls "$root/.be-run")"
note "6) 마무리 OK"

# 앱 JVM 수: 작업 디렉터리가 모듈 폴더인 FakeApp
count_jvm() {
  local m="$1" n=0 p cwd
  for p in $(pgrep -f FakeApp 2>/dev/null || true); do
    cwd="$(lsof -a -p "$p" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
    case "$cwd" in */src/backend/"$m") case "$cwd" in "$tmp"/*|"/private$tmp"/*) n=$((n + 1)) ;; esac ;; esac
  done
  echo "$n"
}
settle_down() { for m in mcm mdm analog; do wait_down "$m" || bad "마무리 뒤 $m 이 남았다"; done; }

# ── 8) local-run 아래 be-run 이 모듈을 전부 빼앗겨 끝나도 프론트·새 JVM 은 산다 ──
BE_PREBUILD=0 bash -c 'exec bash "$0"' "$root/local-run.sh" >"$tmp/L.log" 2>&1 & L=$!
pids_to_kill="$pids_to_kill $L"
wait_up mcm && wait_up mdm || bad "L: local-run 의 백엔드가 뜨지 않았다"
runbg --mcm --mdm >"$tmp/G.log" 2>&1 & G=$!
pids_to_kill="$pids_to_kill $G"
for _ in $(seq 1 60); do grep -q '이어받아 이 be-run 만 끝났습니다\|백엔드(be-run.sh)가 종료됐습니다' "$tmp/L.log" && break; sleep 0.5; done
sleep 5   # 잘못이면 이 사이 local-run 이 프론트를 내리고 잔존 프로세스(명령줄에 root/src 가 든 새 JVM 포함)를 TERM→KILL 한다
alive "$L" || bad "local-run 이 끝났다(백엔드가 이어받혔을 뿐인데 전체를 내렸다)"
fe="$(pgrep -P "$L" 2>/dev/null | head -n 1)"
[ -n "$fe" ] && alive "$fe" || bad "local-run 의 프론트가 내려갔다"
up mcm && up mdm || bad "local-run 의 정리가 이어받은 새 JVM(G)을 내렸다"
kill -TERM "$L" "$G" 2>/dev/null; wait "$L" "$G" 2>/dev/null
settle_down
note "8) local-run: 모듈을 전부 빼앗겨도 프론트·새 JVM 유지"

# ── 9) 같은 모듈을 동시에 시작해도 한쪽만 이기고 고아 JVM 이 없다 ──
for round in 1 2 3 4 5; do
  runbg --mcm --mdm >"$tmp/RA$round.log" 2>&1 & RA=$!
  wait_up mcm && wait_up mdm || bad "라운드 $round: 처음 기동 실패"
  runbg --mcm >"$tmp/RB$round.log" 2>&1 & RB=$!
  runbg --mcm >"$tmp/RC$round.log" 2>&1 & RC=$!
  pids_to_kill="$pids_to_kill $RA $RB $RC"
  sleep 7
  n="$(count_jvm mcm)"
  [ "$n" = 1 ] || bad "라운드 $round: mcm 앱 JVM 이 $n 개다(1개여야 한다)"
  up mcm || bad "라운드 $round: mcm 이 응답하지 않는다"
  winner_jvm="$(port_pid mcm)"
  recorded="$(sed -n '1s/^[0-9]* //p' "$root/.be-run/mcm.own" 2>/dev/null)"
  [ "$recorded" = "$winner_jvm" ] || bad "라운드 $round: 살아 있는 mcm JVM($winner_jvm)이 소유 기록($recorded)과 다르다(관리 밖 고아)"
  [ "$(port_pid mdm)" = "$(port_pid mdm)" ] && up mdm || bad "라운드 $round: mdm 이 내려갔다"
  kill -TERM $RA $RB $RC 2>/dev/null; wait $RA $RB $RC 2>/dev/null
  settle_down
done
note "9) 같은 모듈 동시 시작 5회: JVM 1개, 소유 기록과 일치"

# ── 10) 기록한 be-run 이 죽은 낡은 기록은 무시한다 — 살아 있는 be-run 이 자기 모듈을 놓지 않는다 ──
runbg --mcm --mdm >"$tmp/SA.log" 2>&1 & SA=$!
pids_to_kill="$pids_to_kill $SA"
wait_up mcm && wait_up mdm || bad "SA: 기동 실패"
sleep 0 & dead=$!; wait "$dead" 2>/dev/null
printf '%s -\n' "$dead" > "$root/.be-run/mcm.own"      # 선빌드 실패·강제 종료로 죽은 be-run 이 남긴 기록
sleep 3
kill -TERM "$SA"; wait "$SA" 2>/dev/null
settle_down
note "10) 낡은 기록 무시: SA 종료 때 mcm·mdm 모두 정리됨"

# ── 11) 빌드 전용(--build-only) 실행 중에 새 기동이 그것을 예전 판으로 보고 끝내지 않는다 ──
BE_PREBUILD=1 bash -c 'exec bash "$0" --mdm --analog --build-only' "$root/be-run.sh" >"$tmp/BO.log" 2>&1 & BO=$!
pids_to_kill="$pids_to_kill $BO"
sleep 4.5   # 시작한 지 3초가 지나 「막 시작한 be-run」 예외에 걸리지 않을 때
alive "$BO" || bad "빌드 전용 실행이 너무 일찍 끝났다(시험 준비 문제)"
runbg --mcm >"$tmp/BX.log" 2>&1 & BX=$!
pids_to_kill="$pids_to_kill $BX"
wait_up mcm || bad "BX: mcm 안 뜸"
wait "$BO" 2>/dev/null; bo_rc=$?
[ "$bo_rc" = 0 ] || bad "빌드 전용 실행이 새 기동에 끝났거나 실패했다(exit $bo_rc)"
kill -TERM "$BX" 2>/dev/null; wait "$BX" 2>/dev/null
settle_down
note "11) 빌드 전용 실행 보호: 새 기동 중에도 exit 0 으로 끝남"

# ── 12) 살아 있는 소유자의 기록 잠금은 빼앗지 않는다(fail-closed), 소유자가 끝나면 이어서 진행한다 ──
mkdir -p "$root/.be-run/lock.d"
# 이 체크아웃의 be-run 처럼 보이는 살아 있는 소유자(명령줄이 「bash root/be-run.sh」). exec -a 로 명령줄만 그렇게 꾸민다.
( exec -a "bash $root/be-run.sh" sleep 40 ) & holder=$!
pids_to_kill="$pids_to_kill $holder"
printf '%s\n' "$holder" > "$root/.be-run/lock.d/pid"
runbg --mcm >"$tmp/LK.log" 2>&1 & LK=$!
pids_to_kill="$pids_to_kill $LK"
for _ in $(seq 1 40); do alive "$LK" || break; sleep 0.5; done   # 대기 상한 10초 + 여유
alive "$LK" && bad "잠금을 쥔 소유자가 살아 있는데 둘째 실행이 계속 돈다(빼앗았을 수 있다)"
wait "$LK" 2>/dev/null; lk_rc=$?
[ "$lk_rc" != 0 ] || bad "잠금을 못 얻었는데 정상 종료했다"
[ "$(cat "$root/.be-run/lock.d/pid" 2>/dev/null)" = "$holder" ] || bad "살아 있는 소유자의 잠금이 바뀌었다"
up mcm && bad "잠금을 못 얻은 실행이 mcm 을 띄웠다"
pkill -TERM -P "$holder" 2>/dev/null; kill -TERM "$holder" 2>/dev/null; wait "$holder" 2>/dev/null
# 소유자가 죽었으면 낡은 잠금을 치우고 진행한다
runbg --mcm >"$tmp/LK2.log" 2>&1 & LK2=$!
pids_to_kill="$pids_to_kill $LK2"
wait_up mcm || bad "죽은 소유자의 잠금을 치우고 진행하지 못했다"
kill -TERM "$LK2" 2>/dev/null; wait "$LK2" 2>/dev/null
settle_down
note "12) 기록 잠금: 살아 있는 소유자는 빼앗지 않고 실패, 죽은 소유자는 치우고 진행"

# ── 13) 잠금 소유자 pid 가 다른 프로세스에 재사용돼 살아 있어도(be-run 이 아니면) 낡은 잠금으로 치운다 ──
mkdir -p "$root/.be-run/lock.d"
sleep 40 & reused=$!
pids_to_kill="$pids_to_kill $reused"
printf '%s\n' "$reused" > "$root/.be-run/lock.d/pid"      # be-run 이 아닌 살아 있는 프로세스
runbg --mcm >"$tmp/RU.log" 2>&1 & RU=$!
pids_to_kill="$pids_to_kill $RU"
wait_up mcm || bad "be-run 이 아닌 살아 있는 pid 가 쥔 잠금 때문에 기동하지 못했다"
kill -TERM "$RU" 2>/dev/null; wait "$RU" 2>/dev/null
kill -TERM "$reused" 2>/dev/null; wait "$reused" 2>/dev/null
settle_down
note "13) 잠금 소유자 pid 재사용: be-run 이 아니면 치우고 진행"

# ── 14) 잠금이 비어 보인 시간이 누적돼 막 만든 새 잠금을 지우지 않는다 ──
# 시간표: 0초 빈 잠금 → 4.0초 소유자 pid 기록(살아 있는 be-run 모양) → 4.3초 소유자가 바뀌어 새 잠금(아직 pid 없음) → 7.3초 새 소유자 pid 기록(그 전 3초 동안 pid 없는 잠금).
# 세던 값이 누적되면 5초대에 새 잠금을 지워(그 사이 B 가 잠금을 쥔다) 새 소유자가 pid 를 못 쓴다.
( exec -a "bash $root/be-run.sh" sleep 40 ) & owner2=$!
pids_to_kill="$pids_to_kill $owner2"
rm -rf "$root/.be-run/lock.d"; mkdir -p "$root/.be-run/lock.d"
runbg --mcm >"$tmp/EM.log" 2>&1 & EM=$!
pids_to_kill="$pids_to_kill $EM"
( sleep 4; printf '%s\n' "$owner2" > "$root/.be-run/lock.d/pid"
  sleep 0.3; rm -rf "$root/.be-run/lock.d"; mkdir "$root/.be-run/lock.d"
  sleep 3
  if [ ! -d "$root/.be-run/lock.d" ] || [ -e "$root/.be-run/lock.d/pid" ]; then echo STOLEN > "$tmp/em-flag"; else printf '%s\n' "$owner2" > "$root/.be-run/lock.d/pid"; echo OK > "$tmp/em-flag"; fi ) &
sleep 10
[ "$(cat "$tmp/em-flag" 2>/dev/null)" = OK ] || bad "새 잠금이 pid 를 쓰기 전에 지워졌다/빼앗겼다(누적된 빈 잠금 셈): $(cat "$tmp/em-flag" 2>/dev/null)"
[ -z "${DEBUG14:-}" ] || { echo "--- 14 debug: flag=$(cat "$tmp/em-flag" 2>/dev/null) lock=$(ls "$root/.be-run/lock.d" 2>&1 | tr '\n' ' ') pid=$(cat "$root/.be-run/lock.d/pid" 2>/dev/null)"; sed 's/\x1b\[[0-9;]*m//g' "$tmp/EM.log" | cut -c1-160; }
pkill -TERM -P "$owner2" 2>/dev/null; kill -TERM "$owner2" 2>/dev/null; wait "$owner2" 2>/dev/null
wait_up mcm || bad "소유자가 끝난 뒤 B 가 이어서 기동하지 못했다"
kill -TERM "$EM" 2>/dev/null; wait "$EM" 2>/dev/null
settle_down
note "14) 빈 잠금 셈 초기화: 새 잠금을 지우지 않고 소유자가 끝난 뒤 진행"

# ── 15) be-run 을 부른 래퍼 셸(bash -c·zsh -c '… ./be-run.sh …'·bash heavy.sh ./be-run.sh …)은 표식 없는 예전 판 be-run 으로 보고 끝내지 않는다 ──
# 래퍼의 명령줄에는 be-run.sh 가 들어 있고 cwd 가 체크아웃이며 표식이 없어 예전 판 be-run 으로 오인됐다(2026-10-09: Claude Code 의 zsh -c 래퍼가 exit 144 로 끝남).
cat > "$tmp/heavy.sh" <<'HV'
#!/usr/bin/env bash
# 실제 heavy.sh 처럼 인자로 받은 명령을 자식으로 돌리고 기다린다(exec 하지 않는다).
"$@"
HV
chmod +x "$root/be-run.sh" "$tmp/heavy.sh"
check_wrapper() {   # $1=이름 $2…=래퍼를 띄우는 명령(cwd=$root). be-run(--mdm)을 자식으로 두고 둘째 be-run(--mcm)이 래퍼를 끄지 않는지 본다.
  local name="$1" wp; shift
  ( cd "$root" && exec "$@" ) >"$tmp/W-$name.log" 2>&1 & wp=$!
  pids_to_kill="$pids_to_kill $wp"
  wait_up mdm || { bad "15 $name: 래퍼 아래 mdm 안 뜸"; return; }
  sleep 4   # 시작한 지 3초가 지나 「막 시작한 be-run」 예외에 걸리지 않을 때
  alive "$wp" || bad "15 $name: 래퍼가 시험 준비 중에 끝났다"
  runbg --mcm >"$tmp/W2-$name.log" 2>&1 & local b=$!
  pids_to_kill="$pids_to_kill $b"
  wait_up mcm || bad "15 $name: mcm 안 뜸"
  alive "$wp" || bad "15 $name: 새 be-run 이 be-run 을 부른 래퍼 셸을 끝냈다"
  grep -q '표식 없는 예전 판' "$tmp/W2-$name.log" && bad "15 $name: 래퍼를 예전 판 be-run 으로 보고 종료를 시도했다: $(grep '표식 없는 예전 판' "$tmp/W2-$name.log" | head -n 1)"
  up mdm || bad "15 $name: 래퍼 아래 be-run 의 mdm 이 내려갔다"
  kill -TERM "$b" 2>/dev/null; wait "$b" 2>/dev/null
  pkill -TERM -P "$wp" 2>/dev/null; kill -TERM "$wp" 2>/dev/null; wait "$wp" 2>/dev/null
  settle_down
}
check_wrapper bashc env BE_PREBUILD=0 bash -c 'BE_PREBUILD=0 ./be-run.sh --mdm; :'
check_wrapper heavy env BE_PREBUILD=0 bash "$tmp/heavy.sh" ./be-run.sh --mdm
if command -v zsh >/dev/null 2>&1; then
  check_wrapper zshc env BE_PREBUILD=0 zsh -c 'source /dev/null && BE_PREBUILD=0 ./be-run.sh --mdm > /dev/null 2>&1; :'
fi
note "15) 래퍼 셸 보호: bash -c·heavy.sh·zsh -c 아래 be-run 이 있어도 새 be-run 이 래퍼를 끝내지 않음"

# ── 7) 소유 기록 없이 뜬 예전 버전 be-run 은 종전처럼 끝내고 이어받는다 ──
if [ -n "${OLD_BE_RUN_SRC:-}" ] && [ -f "$OLD_BE_RUN_SRC" ]; then
  new_copy="$tmp/be-run.new.sh"; cp "$root/be-run.sh" "$new_copy"
  cp "$OLD_BE_RUN_SRC" "$root/be-run.sh"
  runbg --mdm --analog >"$tmp/E.log" 2>&1 & E=$!
  pids_to_kill="$pids_to_kill $E"
  wait_up mdm || bad "E(예전 판): mdm 안 뜸"
  cp "$new_copy" "$root/be-run.sh"
  sleep 4   # 시작한 지 3초가 안 된 be-run 은 건드리지 않는 규칙을 지난다
  runbg --mdm >"$tmp/F.log" 2>&1 & F=$!
  pids_to_kill="$pids_to_kill $F"
  for _ in $(seq 1 80); do alive "$E" || break; sleep 0.5; done
  alive "$E" && bad "기록 없는 예전 be-run(E)이 종료되지 않았다"
  wait_up mdm || bad "F: mdm 이 뜨지 않았다"
  kill -TERM "$F" 2>/dev/null; wait "$F" 2>/dev/null
  note "7) 예전 판 be-run 인수: E 종료, F 의 mdm 기동"
fi

if [ "$fail" = 0 ]; then echo "OK: be-run 한 모듈 재기동이 다른 모듈을 내리지 않는다"; else echo "실패 로그: $tmp/*.log"; cp -R "$tmp" "${TMPDIR:-/tmp}/be-run-restart-fail" 2>/dev/null; fi
exit "$fail"
