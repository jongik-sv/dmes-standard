#!/usr/bin/env bash
# 입력 요청(확인·선택·질문 창) 판정·발췌·해시·잠금(source 용). 정본: ../../references/contract.md §4.1 「입력 요청 감지」·「키 입력 답하기」.
# common.sh 를 먼저 source 해야 한다. 발췌·해시는 console-redact.sh(console_screen_filter·console_redact_text)도 필요하다.
#   console_input_kind        stdin 화면 → coord_screen_prompt_kind 결과 그대로(마지막 30줄). 창이 없으면 빈 출력
#   console_excerpt           stdin 화면 → 발췌 최대 10줄(stdout 줄마다). 가림 실패면 비정상 종료 코드·출력 없음
#   console_excerpt_json      위와 같은 발췌를 JSON 배열 한 줄로
#   console_excerpt_sha       stdin 줄들 → sha256 소문자 hex(계약 (c): 줄마다 제어 문자 제거 → 줄 끝 U+0020 만 제거 → `\n` 으로 이음,
#                             끝 개행 없음). 고정 벡터 ['a  ','b'] → 7e18f737…c78
#   console_excerpt_sha_json  stdin JSON 배열 → 같은 sha
#   console_input_snapshot <화면 파일>  감지·재판정·보내기 직전 확인이 모두 쓰는 한 함수. rc 0 창 있음(CI_KIND·CI_EXC·CI_SHA·CI_FULL·CI_WIN) ·
#                             1 창 없음 · 2 가림·해시 실패. CI_FULL = console_full_sha(화면 원문) — 창 머리를 못 찾으면 rc 0 이어도 빈 값이고
#                             (지문 없음) 부르는 쪽은 모두 보내지 않는 쪽으로 닫는다(키 행 prompt_changed · judge-sha NOFP · --expect-sha 거절 ·
#                             auto-answer ESCALATE no-fingerprint). 감지는 창을 기록하되 full 을 null 로 둔다(키 행이 통과하지 못한다)
#   console_full_sha          stdin = 터미널 화면 원문(가리기 전) → 창 지문 sha256 hex 한 줄. 창을 못 잡으면 rc 1·빈 출력. 서버에 보내지 않는
#                             킷 내부 값이고 로컬 기록 파일(권한 600)에만 남는다(로그·stderr 에 내지 않는다). 발췌는 창의 아래쪽만 담고
#                             가림은 줄 나머지를 지우므로(`Authorization: …`) 첫 줄·가린 자리만 다른 두 창을 가르려고 원문으로 만든다.
#                             줄마다 줄 끝 CRLF·끝맺은 ANSI 제거 → 남은 제어 문자는 U+FFFD(나쁜 줄)·보이지 않는 문자 제거(탭·NBSP 는
#                             공백) 뒤 「창」만 고른다. 창 안에 나쁜 줄(가운데 CR 등 제어 문자·2000자 초과)이 있거나 판정이 3초
#                             (COORD_CONSOLE_WINDOW_TIMEOUT_S)를 넘으면 창 없음(지문 없음):
#                               선택지 블록 = 발췌와 같은 열쇠 줄 블록(맨 아래 커서·선택지 줄에서 위로 사이 3줄 이하).
#                               머리: 권한 창은 질문 줄(블록 첫 줄 바로 위의 마지막 글 줄 — 문구로 찾지 않는다)에서 위로 가장 가까운
#                               머리 후보 = 들여쓰기 0 의 가로줄(─ 10개 이상과 공백뿐, 줄 맨 앞이 ─)·`╭` 시작 줄. 그 다음 글 줄이 도구
#                               이름 줄(Bash command·Edit file·Write file·Create file·Read file·Fetch·Tool use 등, 뒤에 `(unsandboxed)`·`(runs on …)` 같은
#                               괄호 한 개 허용 — 설치된 Claude Code 의 제목 변형)이 아니면 실패(더 위로
#                               찾지 않는다). 명령 본문은 창 안에서 들여쓰기돼 그려지므로 본문 속 가로줄·`╭` 은 머리가 되지 않는다.
#                               그 밖의 창은 블록 위의 마지막 가로줄·`╭` 줄, 없으면 블록 바로 위 글 묶음(빈 줄로 나뉜)의 첫 줄
#                               (질문 문장). 그 첫 줄이 입력 1행이고 입력이 41줄 이상이면(위로 밀렸을 수 있다) 실패.
#                               끝: 블록 마지막 선택지 줄부터 3줄 안에서 안내 줄(Esc to cancel·Enter to select·to navigate·Tab to amend)이
#                               있으면 그 줄까지, 없으면 빈 줄 없이 바로 이어지는 더 깊은 들여쓰기 줄(마지막 선택지의 설명)까지.
#                               빈 줄 뒤의 다른 줄(상태줄·사용량 %)과 그 아래는 넣지 않는다.
#                             창 줄마다 커서 표시(❯·›·> + 공백)를 지우고 공백 연속을 하나로·앞뒤 공백 제거 → 첫 줄 kind 와 함께 `\n` 으로
#                             이어 sha256(커서만 움직인 같은 창은 같은 값 — 커서는 발췌 sha 가 맡는다). 창 밖 줄만 다른 화면은 같은 값이고,
#                             41줄로 읽든 80줄로 읽든 창이 둘 다에 들어 있으면 같은 값이다.
#   console_window_json       stdin = 화면 원문 → 위 창 판정 한 번의 결과 JSON 한 줄 {text, perm}. text 는 지문의 해시 앞 글, perm 은 권한 창이면
#                             {tool, tind, q, qind, body:[{t,i}], opts:[…]}(도구 이름 줄·질문 줄·본문 줄(머리·도구 이름 줄·질문 줄·선택지 줄을
#                             뺀 나머지)·질문 아래 선택지 줄, i·tind·qind 는 들여쓰기 칸 수) 아니면 null, gen 은 그 밖의 kind 창 모양
#                             (아래 _CI_FULL_JQ 머리 주석). 창을 못 잡으면 rc 1·빈 출력.
#                             auto-answer 는 지문과 같은 이 창만 보고 명령·질문·선택지를 판정한다(console_input_snapshot 의 CI_WIN)
#   console_now_ms_iso        지금 UTC 밀리초 ISO(…Z). date %N → node → 초 단위 `.000Z` 순
#   console_iso_to_ms <iso>   시간대가 있는 ISO(Z·±hh:mm, 소수초 허용) → 에포크 밀리초. 형식이 틀리면 rc 1·빈 출력
#   console_ms_to_iso <ms>    에포크 밀리초 → UTC 밀리초 ISO
#   console_lane_lock <레인> [대기 초]  레인 단위 잠금 $DFLOW_CONSOLE_DIR/lock/lane-<레인>/ (mkdir, 안에 pid·pstart). 죽은 주인이면
#                             탈취한다. 기본 대기 COORD_CONSOLE_LANE_LOCK_WAIT_S(10초). 잡으면 0
#   console_lane_unlock <레인>  내가 쥔 잠금만 푼다
#   console_lane_mark_sent <레인> <sha|->      그 레인에 키를 막 보냈다는 표식(<레인>.sent = `<epoch> <sha>`)
#   console_lane_recent_send <레인> <sha|->    COORD_CONSOLE_SENT_GRACE_S(10초) 안에 같은 발췌(또는 sha 모름)로 보냈으면 0
#                             (보낸 키가 아직 화면에 반영되지 않은 같은 창에 두 번 답하지 않게)
#   console_consumed_add <이름> <since> <sha> [full]  소비 목록 input/consumed/<이름>.list 에 `since sha` 한 줄(최근 20줄만, 같은 줄이
#                             이미 있으면 더하지 않는다). full(창 지문)을 주면 input/consumed/<이름>.full 에 `since full` 도(같은 규칙)
#   console_consumed_has <이름> <since> <sha> [full]  같은 순간(밀리초 비교)·같은 sha 의 줄이 있거나, full 을 주면 같은 순간·같은 full 의
#                             줄이 있으면 0(커서가 움직여 발췌 sha 가 바뀐 같은 창도 소비된 것으로 본다)
#   console_consumed_has_since <이름> <since>  두 목록 중 하나에 같은 순간의 줄이 있으면 0(sha·full 무관)
#   console_input_rec_lock <이름> / console_input_rec_unlock <이름>  기록 파일 하나의 읽고-고치고-쓰기 잠금(짧게 쥔다)
#   console_input_write <이름> <json>          input/<이름>.json 원자적 쓰기(임시 파일 → mv, 권한 600)
#   console_input_mark_handled <이름> <coordinator|auto> [<기대 full>]  기록 잠금 안에서: 기록이 없으면 rc 1. 기대 full 을 주었는데
#                             기록의 full 과 다르면(기록에 없음 포함 — 기록이 이미 다음 창) rc 2 이고 아무것도 바꾸지 않는다. 아니면 handled 를
#                             {by,at} 로 쓰고 (since, 기록 발췌 sha)·(since, 기록 full) 을 소비 목록에 넣는다 rc 0(소비 쓰기 실패면 CI_MH_CONS=0).
#                             잠금·쓰기 실패 rc 4. rc 0 이면 CI_MH_REC = 바꾸기 전 기록 JSON. 레인 잠금을 쥔 채 불러도 된다(잠금 순서 레인 → 기록)
#   console_input_notify <이름>  폴러가 다음 주기에 office.sh 로 알리게 input/.notify/<이름> 표식을 남긴다
# <이름> = `<kind>_<ref>`(coord_lane_<레인>·coord_lead_<세션8>·team_lead_lead). ref 는 [A-Za-z0-9._-] 만(경로 이탈 방지).
# 화면 원문·발췌는 stderr 에 내지 않는다.
_ci_d="${BASH_SOURCE[0]%/*}"; [ "$_ci_d" != "${BASH_SOURCE[0]}" ] || _ci_d=.
. "$_ci_d/js-bridge.sh"   # COORD_JS_CONSOLE_INPUT=1 이면 아래 공개 25함수를 scripts/lib/console-input.mjs(node)로 넘긴다(기본 꺼짐; 셸 변수인 DFLOW_CONSOLE_DIR·COORD_CONSOLE_* 는 호출마다 환경으로 넘긴다)

_ci_dir() { coord_expand "${DFLOW_CONSOLE_DIR:-$HOME/.dflow/console}"; }
console_input_ref_ok() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_ref_ok "$@"; return; fi; case "${1:-}" in ''|.*|*[!A-Za-z0-9._-]*) return 1 ;; esac; [ "${#1}" -le 64 ]; }
_ci_name_ok() { case "${1:-}" in coord_lane_?*|coord_lead_?*|team_lead_lead) console_input_ref_ok "${1#*_*_}" ;; *) return 1 ;; esac; }

console_input_kind() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_kind "$@"; return; fi; coord_screen_prompt_kind; }

# 발췌(계약 보강 (가)): 가린 화면 줄(console_screen_filter, ≤40줄)을 줄마다 정리(제어 문자 삭제·줄 끝 공백 제거·200자 자름)한 뒤
#   열쇠 줄 = 커서 줄(앞의 상자 테두리·공백을 건너뛰고 ❯·›·> + 공백 + 글) · 선택지 줄(앞에 커서가 있어도 되는 `N.`).
#   맨 아래 열쇠 줄에서 위로, 사이 일반 줄이 3줄 이하인 열쇠 줄들을 한 창(블록)으로 본다(대화 기록 속 번호 목록은 떨어져 있어 빠진다).
#   블록이 10줄 안이면: 블록 끝 + 3줄(안내 줄)까지를 아래 끝으로, 블록 첫 줄을 반드시 포함하는 연속 10줄.
#   10줄보다 길면: 커서 줄과 그 가까운 열쇠 줄(같은 거리면 아래쪽)만 10개. 열쇠 줄이 없으면 마지막 10줄.
#   권한 창 명령 첫 줄: 창 첫 열쇠 줄 위의 마지막 머리 줄(끝이 Bash command·Edit file·Write file·Read file·Fetch·command)
#   다음의 첫 글 줄. 위 선택에 빠졌으면 커서 줄 → 명령 첫 줄 → 커서에 가까운 열쇠 줄 → 창 안 일반 줄 → 명령 나머지 줄
#   (위에서부터) → 창 아래 안내 줄 순으로 10줄을 고른다(모자라면 안내 줄부터 버린다). 여러 줄 명령의 앞부분이 발췌에서 빠져
#   첫 줄만 다른 두 창이 같은 sha 를 내지 않게 한다.
#   앞뒤 빈 줄을 걷고, JSON 이 2800바이트를 넘으면 위쪽 일반 줄부터, 그다음 커서에서 먼 열쇠 줄부터, 마지막에 명령 첫 줄을
#   버린다(input_request 전체 3072바이트 상한 — 커서 줄은 버리지 않는다).
_CI_EXCERPT_JQ='
def clean: gsub("[\u0000-\u001f\u007f-\u009f]"; "") | sub(" +\\z"; "") | .[0:200] | sub(" +\\z"; "");
def body: sub("\\A[\\s│┃║|]*"; "");
def core: body | sub("[\\s│┃║|]*\\z"; "");
def iscur: body | test("\\A(?:❯|›|>)\\s+\\S");
def isopt: body | test("\\A(?:(?:❯|›|>)\\s*)?[0-9]+\\.(?:\\s|\\z)");
def ishdr: core | test("(?:Bash command|Edit file|Write file|Read file|Fetch|command)\\z");
def inarr($x): any(.[]; . == $x);
def over: (map(.t) | tojson | utf8bytelength) > 2800;
(split("\n") | (if length > 0 and .[-1] == "" then .[:-1] else . end) | map(clean)) as $L
| ($L | length) as $n
| [range(0; $n) | select(($L[.] | iscur) or ($L[.] | isopt))] as $K
| (if ($K | length) == 0 then {sel: [range([0, $n - 10] | max; $n)], keys: [], cur: -1, cmd: null}
   else
     (reduce ($K | reverse | .[1:][]) as $k ({chain: [$K[-1]], stop: false};
        if .stop then . elif (.chain[-1] - $k - 1) <= 3 then .chain += [$k] else .stop = true end)
      | .chain | reverse) as $B
     | ([$B[] | select($L[.] | iscur)] | if length > 0 then .[-1] else $B[-1] end) as $c
     | $B[0] as $f | $B[-1] as $l
     | ([$n - 1, $l + 3] | min) as $e0
     | ([range(0; $f) | select($L[.] | ishdr)] | .[-1]) as $h
     | (if $h == null then null else ([range($h + 1; $f) | select($L[.] | core | test("\\S"))] | .[0]) end) as $cmd
     | (if ($l - $f + 1) <= 10 then
          ([0, ([$f, $e0 - 9] | min)] | max) as $s
          | ([$e0, $s + 9] | min) as $e
          | [range($s; $e + 1)]
        else ($B | sort_by([((. - $c) | fabs), -.]) | .[0:10] | sort) end) as $sel0
     | (if $cmd == null or ($sel0 | inarr($cmd)) then $sel0
        else ([$c, $cmd]
              + ($B | sort_by([((. - $c) | fabs), -.]))
              + [range($f; $l + 1) | select(. as $i | $B | inarr($i) | not)]
              + [range($cmd + 1; $f)]
              + [range($l + 1; $e0 + 1)])
             | reduce .[] as $x ([]; if inarr($x) then . else . + [$x] end)
             | .[0:10] | sort end) as $sel
     | {sel: $sel, keys: $B, cur: $c, cmd: $cmd}
   end) as $w
| [$w.sel[] | {i: ., t: $L[.]}]
| until(length == 0 or (.[0].t | test("\\S")); .[1:])
| until(length == 0 or (.[-1].t | test("\\S")); .[:-1])
| until((over | not) or length <= 1;
    ([.[] | .i | select(. as $i | ($w.keys | inarr($i) | not) and $i != $w.cmd)]) as $nk
    | (if ($nk | length) > 0 then $nk[0]
       else (([.[] | .i | select(. != $w.cur and . != $w.cmd)] | sort_by([(-((. - $w.cur) | fabs)), .]) | .[0]) // $w.cmd) end) as $d
    | map(select(.i != $d)))
| map(.t)'
_CI_SHA_JQ='map(gsub("[\u0000-\u001f\u007f-\u009f]"; "") | sub(" +\\z"; "")) | join("\n")'
# 화면 원문 → 창(console_window_json). 창을 못 잡으면 아무것도 내지 않는다. $k = kind.
#   {text: 창 지문의 해시 앞 글(console_full_sha), perm: 권한 창이면 {tool, tind, q, qind, body:[{t,i}], opts:[…], rest:[…]} 아니면 null,
#    gen: 권한 창이 아니면 {hk, ptool, blk, pre:[…], opts:[…], tail:[…]} 아니면 null}
#   rest = 도구 이름 줄 아래 창 줄 전부(본문·질문·선택지·끝 — 판단 올리기 기록용). gen 은 확인·선택 창(trust·usage-limit·question·
#   choice)의 모양: hk 머리 종류(rule0 들여쓰기 0 가로줄·`╭` / rule 들여쓴 가로줄 / para 글 묶음), ptool 선택지 블록 위로 가장 가까운
#   들여쓰기 0 머리 다음 글 줄이 도구 이름 줄(= 권한 창 모양), blk 선택지 블록 안의 열쇠 줄 아닌 글 줄이 모두 열쇠 줄의 가장 얕은
#   들여쓰기보다 깊다(본문 속 가짜 선택지가 진짜 질문 줄을 사이에 두고 블록에 붙지 않았다), pre 머리(가로줄이면 그 다음)부터 블록 앞까지
#   글 줄(첫 줄 = 제목, 끝 줄 = 질문 줄), opts 블록의 열쇠 줄, tail 블록 첫 줄부터 창 끝까지 글 줄.
# 줄 정리(prep): 줄 끝 CR 한두 개(CRLF)만 지우고 ANSI(끝맺은 CSI·OSC·두 글자 ESC 시퀀스)를 지운 뒤에도 제어 문자(탭 제외 C0·DEL·C1,
#   가운데 CR·끝맺지 않은 ESC 포함)가 남았거나 2000자(코드포인트)를 넘는 줄은 「나쁜 줄」이다. 나쁜 줄의 제어 문자는 U+FFFD 로 바꿔
#   (빈 줄·가로줄·질문 줄로 바뀌지 않게 — 예전처럼 마지막 CR 뒤 조각만 남기지 않는다) 창 범위를 정하고, 창(머리~끝) 안에 나쁜 줄이
#   하나라도 있으면 창 없음(지문 없음)으로 닫는다. 창 밖(대화 기록 위쪽) 나쁜 줄은 창을 막지 않는다. 긴 줄은 정리 전에 2000자로 잘라
#   판정 시간을 묶는다(console_window_json 은 그 위에 시간 상한도 둔다). 탭·NBSP 는 공백, 보이지 않는 문자는 지운다.
_CI_FULL_JQ='
def ansi: gsub("\u001b\\[[0-?]*[ -/]*[@-~]"; "")
  | gsub("\u001b[\\]PX^_][^\u0007\u001b]*(?:\u0007|\u001b\\\\)"; "")
  | gsub("\u001b[ -/]*[0-~]"; "");
def prep: (length > 2000) as $long
  | (if $long then .[0:2000] else . end)
  | sub("\r{1,2}\\z"; "") | ansi | gsub("[\t ]"; " ")
  | test("[\u0000-\u001f\u007f-\u009f]") as $cc
  | {s: (gsub("[\u0000-\u001f\u007f-\u009f]"; "�") | gsub("[­̀-ͯ​-‏‪-‮⁠-⁩﻿]"; "")),
     b: ($long or $cc)};
def body: sub("\\A[\\s│┃║|]*"; "");
def iscur: body | test("\\A(?:❯|›|>)\\s+\\S");
def isopt: body | test("\\A(?:(?:❯|›|>)\\s*)?[0-9]+\\.(?:\\s|\\z)");
def blank: test("\\A\\s*\\z");
def isrule: test("\\A\\s*╭") or (test("\\A[\\s─]*\\z") and ((gsub("[^─]"; "") | length) >= 10));
# 권한 창 머리: 들여쓰기 0(앞에 공백·테두리 없이)의 ─ 만으로 된 줄(10개 이상) 또는 `╭` 시작 줄. 명령 본문은 창 안에서 들여쓰기돼
# 그려지므로 본문 안 가로줄·`╭` 은 머리가 되지 않는다.
def ishead: test("\\A╭") or (test("\\A─[─ ]*\\z") and ((gsub("[^─]"; "") | length) >= 10));
def bcore: sub("\\A[\\s│┃║]*"; "") | sub("[\\s│┃║]*\\z"; "");
def vacant: bcore == "";
def istool: bcore | test("\\A(?:(?:Bash|Shell|PowerShell) command|(?:Edit|Write|Create|Overwrite|Read|Update) file|Edit notebook|Fetch|Web ?[Ss]earch|Tool use)(?: \\([^()]*\\))?\\z");
def ishint: test("Esc to cancel|Enter to select|to navigate|Tab to amend");
def ind: (match("\\A[\\s│┃║|]*") | .length);
def fold: (if test("\\A[\\s│┃║|]*(?:❯|›|>)\\s+\\S") then sub("\\A(?<a>[\\s│┃║|]*)(?:❯|›|>)"; "\(.a) ") else . end)
  | gsub("\\s+"; " ") | sub("\\A "; "") | sub(" \\z"; "");
(split("\n") | (if length > 0 and .[-1] == "" then .[:-1] else . end) | map(prep)) as $P
| ($P | map(.s)) as $L
| ($P | map(.b)) as $X
| ($L | length) as $n
| [range(0; $n) | select(($L[.] | iscur) or ($L[.] | isopt))] as $K
| if ($K | length) == 0 then empty else
    (reduce ($K | reverse | .[1:][]) as $k ({chain: [$K[-1]], stop: false};
       if .stop then . elif (.chain[-1] - $k - 1) <= 3 then .chain += [$k] else .stop = true end)
     | .chain | reverse) as $B
    | $B[0] as $f | $B[-1] as $l
    | (if $k == "permission" then
         # 질문 줄 = 블록 첫 줄 바로 위의 마지막 글 줄(문구로 찾지 않는다 — 대화 기록 속 가짜 질문에 속지 않게).
         # 머리 = 질문 줄 위로 가장 가까운 머리 후보. 그 다음 글 줄이 도구 이름 줄이 아니면 실패(더 위로 찾지 않는다)
         ([range(0; $f) | select($L[.] | vacant | not)] | .[-1]) as $q
         | if $q == null then null else
             ([range(0; $q) | select($L[.] | ishead)] | .[-1]) as $h0
             | if $h0 == null then null else
                 ([range($h0 + 1; $q) | select($L[.] | vacant | not)] | .[0]) as $t
                 | if $t != null and ($L[$t] | istool) then {h: $h0, t: $t, q: $q} else null end
               end
           end
       else
         ([range(0; $f) | select($L[.] | isrule)] | .[-1]) as $r
         | if $r != null then {h: $r, hk: (if ($L[$r] | ishead) then "rule0" else "rule" end), b0: ($r + 1)}
           else ([range(0; $f) | select($L[.] | blank | not)] | .[-1]) as $p
             | if $p == null then null
               else (([range(0; $p + 1) | select($L[.] | blank)] | .[-1]) as $b | if $b == null then 0 else $b + 1 end) as $h0
                 | if $h0 == 0 and $n >= 41 then null else {h: $h0, hk: "para", b0: $h0} end
               end
           end
       end) as $w
    | if $w == null then empty else
        (reduce range($l + 1; ([$l + 3, $n - 1] | min) + 1) as $j ({e: $l, go: true, cont: true};
           if (.go | not) then .
           elif ($L[$j] | ishint) then .e = $j | .go = false
           elif ($L[$j] | blank) then .cont = false
           elif .cont and (($L[$j] | ind) > ($L[$l] | ind)) then .e = $j
           else .go = false end) | .e) as $e
        # 창(머리~끝) 안에 나쁜 줄(제어 문자·너무 긴 줄)이 있으면 창 없음 = 지문 없음
        | if any(range($w.h; $e + 1); $X[.]) then empty else
        {text: ([$k] + [$L[$w.h:($e + 1)][] | select(test("automatically deny this request in [0-9]+:[0-9]+") | not) | fold] | join("\n")),   # 자동 거부 카운트다운 줄(m:ss)은 시각마다 바뀌어 지문에서 뺀다
           perm: (if $w.t == null then null else
                    {tool: ($L[$w.t] | bcore), tind: ($L[$w.t] | ind), q: ($L[$w.q] | bcore), qind: ($L[$w.q] | ind),
                     body: [range($w.t + 1; $w.q) | select($L[.] | vacant | not) | {t: ($L[.] | bcore), i: ($L[.] | ind)}],
                     opts: [$B[] | select(. > $w.q) | $L[.] | bcore],
                     rest: [range($w.t + 1; $e + 1) | select($L[.] | vacant | not) | $L[.] | bcore]} end),
           gen: (if $k == "permission" then null else
                   ([range(0; $f) | select($L[.] | ishead)] | .[-1]) as $hz
                   | (if $hz == null then null else ([range($hz + 1; $f) | select($L[.] | vacant | not)] | .[0]) end) as $tz
                   | ([$B[] | $L[.] | ind] | min) as $mi
                   | {hk: $w.hk,
                      ptool: ($tz != null and ($L[$tz] | istool)),
                      blk: all(range($f; $l + 1); . as $i | any($B[]; . == $i) or ($L[$i] | blank) or (($L[$i] | ind) > $mi)),
                      pre: [range($w.b0; $f) | select($L[.] | vacant | not) | $L[.] | bcore],
                      opts: [$B[] | $L[.] | bcore],
                      tail: [range($f; $e + 1) | select($L[.] | vacant | not) | $L[.] | bcore]} end)}
        end
      end
  end'

console_excerpt_json() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_excerpt_json "$@"; return; fi
  local f
  f="$(console_screen_filter)" || return 71
  printf '%s\n' "$f" | jq -Rsc "$_CI_EXCERPT_JQ" 2>/dev/null
}
console_excerpt() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_excerpt "$@"; return; fi; local j; j="$(console_excerpt_json)" || return $?; printf '%s' "$j" | jq -r '.[]'; }
# openssl → sha256sum → node crypto 순(shasum 은 perl 기반이라 호출당 비용이 5배쯤 들어 쓰지 않는다). 출력은 늘 소문자 hex 64자 한 줄(같은 값).
_ci_sha256() {
  local h
  if command -v openssl >/dev/null 2>&1; then h="$(openssl dgst -sha256 -r 2>/dev/null)" || return 1; printf '%s\n' "${h%% *}"
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
  elif command -v node >/dev/null 2>&1; then
    node -e 'const c=require("crypto"),h=c.createHash("sha256");process.stdin.on("data",d=>h.update(d)).on("end",()=>process.stdout.write(h.digest("hex")+"\n"))' 2>/dev/null
  else return 1; fi
}
console_excerpt_sha() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_excerpt_sha "$@"; return; fi
  jq -Rsj 'split("\n") | (if length > 0 and .[-1] == "" then .[:-1] else . end) | '"$_CI_SHA_JQ" 2>/dev/null | _ci_sha256
}
console_excerpt_sha_json() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_excerpt_sha_json "$@"; return; fi; jq -j "$_CI_SHA_JQ" 2>/dev/null | _ci_sha256; }

# 창 지문(위 머리 주석). 폴러 감지·키 행 재판정·judge-sha·term-send-safe --expect-sha·auto-answer 판정과 재확인이 모두
# console_input_snapshot 을 거쳐 이 함수 하나를 쓴다(입력 줄 수가 달라도 창이 같으면 같은 값).
# 판정 1회의 시간 상한 COORD_CONSOLE_WINDOW_TIMEOUT_S(기본 3초, 1~30). 넘으면 jq 를 끊고 창 없음(지문 없음)으로 닫는다.
# GNU timeout 이 있으면 그것으로, 없으면(macOS) 셸 감시로 건다: 명령을 백그라운드로 띄우고(stdin 은 `<&0` 으로 명시해 넘긴다 — 비대화형 bash 는
# 리다이렉트 없는 & 명령의 stdin 을 /dev/null 로 바꾼다) 감시 서브셸이 sleep 뒤 명령 pid 에 TERM 을 보낸다(console-poll.sh run_limited 의 감시자와
# 같은 방식: sleep pid 를 쥐고 TERM trap 으로 그 sleep 만 죽인다). 감시자는 stdout·stderr 를 /dev/null 로 돌려 파이프를 붙잡지 않는다.
# 명령이 먼저 끝나면 감시를 끄고 기다려 sleep 이 남지 않는다. 반환 rc 는 명령의 rc(시간 초과면 timeout 은 124, 셸 감시는 TERM 종료 143).
_ci_timed() {
  local t="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-3}" cp wd rc
  case "$t" in ''|*[!0-9]*) t=3 ;; esac
  [ "$t" -ge 1 ] && [ "$t" -le 30 ] || t=3
  if command -v timeout >/dev/null 2>&1; then timeout "$t" "$@"; return $?; fi
  "$@" <&0 &
  cp=$!
  ( trap 'kill "$sp" 2>/dev/null; exit 0' TERM
    sleep "$t" & sp=$!
    wait "$sp" 2>/dev/null || exit 0       # sleep 이 중간에 죽었으면(명령이 먼저 끝나 감시가 꺼짐) 시간 초과가 아니다
    kill -0 "$cp" 2>/dev/null || exit 0    # 막 끝난 명령은 건드리지 않는다
    kill -TERM "$cp" 2>/dev/null ) </dev/null >/dev/null 2>&1 &
  wd=$!
  wait "$cp" 2>/dev/null && rc=0 || rc=$?
  kill "$wd" 2>/dev/null; wait "$wd" 2>/dev/null
  return "$rc"
}
console_window_json() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_window_json "$@"; return; fi
  local s k
  s="$(cat)"
  k="$(printf '%s\n' "$s" | coord_screen_prompt_kind)"
  [ -n "$k" ] || return 1
  printf '%s\n' "$s" | _ci_timed jq -Rsc --arg k "$k" "$_CI_FULL_JQ" 2>/dev/null | grep -m1 '^{' || return 1
}
# 소문자 hex 64자 한 줄이면 0(grep -Eq '^[0-9a-f]{64}$' 와 같은 판정을 프로세스 없이 — 여러 줄 글은 거절하므로 오히려 엄격하다)
_ci_hex64() { case "$1" in ''|*[!0-9a-f]*) return 1 ;; esac; [ "${#1}" -eq 64 ]; }
# 창 JSON(console_window_json 한 줄) → 지문 sha. 못 만들면 rc 1·빈 출력
_ci_full_of_win() {
  local t h
  t="$(printf '%s' "${1:-}" | jq -j '.text // empty' 2>/dev/null)" || return 1
  [ -n "$t" ] || return 1
  h="$(printf '%s' "$t" | _ci_sha256)"
  _ci_hex64 "$h" || return 1
  printf '%s\n' "$h"
}
console_full_sha() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_full_sha "$@"; return; fi
  local w
  w="$(console_window_json)" || return 1
  _ci_full_of_win "$w"
}

CI_KIND=""; CI_EXC=""; CI_SHA=""; CI_FULL=""; CI_WIN=""
console_input_snapshot() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_callg console-input console_input_snapshot "CI_KIND CI_EXC CI_SHA CI_FULL CI_WIN" "$@"; return; fi
  local f
  CI_KIND="$(console_input_kind < "$1")"; CI_EXC=""; CI_SHA=""; CI_FULL=""; CI_WIN=""
  [ -n "$CI_KIND" ] || return 1
  f="$(console_screen_filter < "$1")" || return 2     # console_excerpt_json 과 같은 가림(한 번만)
  CI_EXC="$(printf '%s\n' "$f" | jq -Rsc "$_CI_EXCERPT_JQ" 2>/dev/null)" || { CI_EXC=""; return 2; }
  case "$CI_EXC" in "["*"]") ;; *) CI_EXC=""; return 2 ;; esac   # jq 가 낸 한 줄이 [ … ] 이면 배열(jq -e type 확인과 같다 — 프로세스 없이)
  CI_SHA="$(printf '%s' "$CI_EXC" | console_excerpt_sha_json)"
  _ci_hex64 "$CI_SHA" || { CI_EXC=""; CI_SHA=""; return 2; }
  # 원문(가리기 전) 창. 못 잡으면 둘 다 빈 값 = 지문 없음. 지문과 창 JSON 은 같은 한 번의 창 판정에서 나온다
  CI_WIN="$(console_window_json < "$1")" || CI_WIN=""
  CI_FULL="$(_ci_full_of_win "$CI_WIN")" || { CI_FULL=""; CI_WIN=""; }
  return 0
}

# ---- 시각 ------------------------------------------------------------------------------------
# GNU·macOS date 의 %N → node → 초 단위. 앞 둘은 결과가 ms ISO 꼴일 때만 쓴다(마지막은 예전처럼 검증 없이).
console_now_ms_iso() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_now_ms_iso "$@"; return; fi
  local d n
  d="$(date -u +%Y-%m-%dT%H:%M:%S.%N 2>/dev/null)"
  if [[ "$d" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{9}$ ]]; then printf '%s' "${d:0:23}Z"; return 0; fi
  if command -v node >/dev/null 2>&1; then
    n="$(node -e 'process.stdout.write(new Date().toISOString())' 2>/dev/null)"
    if [[ "$n" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$ ]]; then printf '%s' "$n"; return 0; fi
  fi
  date -u +%Y-%m-%dT%H:%M:%S.000Z
}
console_iso_to_ms() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_iso_to_ms "$@"; return; fi
  local iso="${1:-}" e fr
  [[ "$iso" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,9})?(Z|[+-][0-9]{2}:[0-9]{2})$ ]] || return 1   # grep -Eqx 와 같은 꼴(프로세스 없이)
  e="$(coord_iso_to_epoch "$iso")"
  case "$e" in ''|*[!0-9-]*) return 1 ;; esac
  fr=""; case "$iso" in *.*) fr="${iso#*.}"; fr="${fr%%[Z+-]*}" ;; esac
  fr="${fr}000"; fr="${fr:0:3}"
  printf '%s\n' "$(( e * 1000 + 10#$fr ))"
}
console_ms_to_iso() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_ms_to_iso "$@"; return; fi
  local ms="${1:-}" s
  case "$ms" in ''|*[!0-9]*) return 1 ;; esac
  s=$(( ms / 1000 ))
  printf '%s.%03dZ\n' "$(compat_epoch_fmt "$s" %Y-%m-%dT%H:%M:%S -u)" $(( ms % 1000 ))
}

# ---- 레인 잠금·보낸 표식 -----------------------------------------------------------------------
_ci_lock_live() {  # <잠금 폴더> — 산 주인이 쥐고 있으면 0
  local d="$1" p ps mt
  [ -d "$d" ] || return 1
  coord_read1 p "$d/pid"
  if [ -z "$p" ]; then   # 막 mkdir 한 직후
    mt="$(coord_file_mtime "$d" 2>/dev/null || echo 0)"
    [ $(( $(date +%s) - ${mt:-0} )) -lt 5 ]; return
  fi
  kill -0 "$p" 2>/dev/null || return 1
  coord_read1 ps "$d/pstart"
  [ -z "$ps" ] || ! declare -F coord_pstart >/dev/null 2>&1 || [ "$ps" = "$(coord_pstart "$p")" ]
}
_ci_lock_write() { printf '%s\n' "$$" > "$1/pid"; declare -F coord_pstart >/dev/null 2>&1 && coord_pstart "$$" > "$1/pstart" 2>/dev/null; return 0; }
console_lane_lock() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_lane_lock "$@"; return; fi
  local lane="${1:-}" wait="${2:-${COORD_CONSOLE_LANE_LOCK_WAIT_S:-10}}" d m st i=0 n p
  console_input_ref_ok "$lane" || return 1
  case "$wait" in ''|*[!0-9]*) wait=10 ;; esac
  d="$(_ci_dir)/lock/lane-$lane"; m="$d.steal"
  coord_mkdirp "${d%/*}"
  n=$(( wait * 5 ))
  while :; do
    if mkdir "$d" 2>/dev/null; then _ci_lock_write "$d"; return 0; fi
    coord_read1 p "$d/pid"; [ "$p" = "$$" ] && return 0      # 이미 내가 쥐고 있다
    if ! _ci_lock_live "$d" && mkdir "$m" 2>/dev/null; then   # 죽은 주인: 탈취 잠금 아래에서 다시 확인하고 옮긴 뒤 새로 만든다
      if ! _ci_lock_live "$d"; then
        st="$d.stale.$$"; mv "$d" "$st" 2>/dev/null; rm -rf "$st"
        if mkdir "$d" 2>/dev/null; then _ci_lock_write "$d"; rmdir "$m" 2>/dev/null; return 0; fi
      fi
      rmdir "$m" 2>/dev/null
    elif [ -d "$m" ] && [ $(( $(date +%s) - $(coord_file_mtime "$m" 2>/dev/null || echo 0) )) -ge 10 ]; then rmdir "$m" 2>/dev/null
    fi
    i=$((i + 1)); [ "$i" -ge "$n" ] && return 1
    sleep 0.2
  done
}
console_lane_unlock() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_lane_unlock "$@"; return; fi
  local d p; console_input_ref_ok "${1:-}" || return 0
  d="$(_ci_dir)/lock/lane-$1"
  coord_read1 p "$d/pid"; [ "$p" = "$$" ] && rm -rf "$d"
  return 0
}
console_lane_mark_sent() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_lane_mark_sent "$@"; return; fi
  local d; console_input_ref_ok "${1:-}" || return 0
  d="$(_ci_dir)/lock"; coord_mkdirp "$d"
  printf '%s %s\n' "$(coord_now_epoch)" "${2:--}" > "$d/lane-$1.sent.tmp.$$" && mv -f "$d/lane-$1.sent.tmp.$$" "$d/lane-$1.sent"
}
console_lane_recent_send() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_lane_recent_send "$@"; return; fi
  local f t s g="${COORD_CONSOLE_SENT_GRACE_S:-10}"
  console_input_ref_ok "${1:-}" || return 1
  case "$g" in ''|*[!0-9]*) g=10 ;; esac
  f="$(_ci_dir)/lock/lane-$1.sent"
  read -r t s < "$f" 2>/dev/null || return 1
  case "$t" in ''|*[!0-9]*) return 1 ;; esac
  [ $(( $(coord_now_epoch) - t )) -lt "$g" ] || return 1
  [ "$s" = - ] || [ "${2:--}" = - ] || [ "$s" = "$2" ]
}

# ---- 소비 목록 -------------------------------------------------------------------------------
_ci_consumed_file() { printf '%s/input/consumed/%s.list' "$(_ci_dir)" "$1"; }
_ci_consumed_full_file() { printf '%s/input/consumed/%s.full' "$(_ci_dir)" "$1"; }
_ci_list_add() {  # <파일> <since> <값> — 같은 줄이 이미 있으면 그대로, 최근 20줄만
  ( umask 077; _d="${1%/*}"; { [ -d "$_d" ] || mkdir -p "$_d"; } || exit 1
    # grep -qxF·cat|tail -n 20 대신 내장으로: 같은 줄이 있으면 그대로, 없으면 (옛 줄 + 새 줄)의 마지막 20줄을 쓴다
    _new="$2 $3"; _ls=(); _n=0
    if [ -f "$1" ]; then
      while IFS= read -r _l || [ -n "$_l" ]; do [ "$_l" = "$_new" ] && exit 0; _ls[$_n]="$_l"; _n=$((_n + 1)); done < "$1"
    fi
    _ls[$_n]="$_new"; _n=$((_n + 1)); _i=0; [ "$_n" -le 20 ] || _i=$((_n - 20))
    while [ "$_i" -lt "$_n" ]; do printf '%s\n' "${_ls[$_i]}"; _i=$((_i + 1)); done > "$1.tmp.$$" && mv -f "$1.tmp.$$" "$1" )
}
console_consumed_add() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_consumed_add "$@"; return; fi
  _ci_name_ok "${1:-}" || return 1
  _ci_hex64 "${3:-}" || return 1
  console_iso_to_ms "${2:-}" >/dev/null || return 1
  _ci_list_add "$(_ci_consumed_file "$1")" "$2" "$3" || return 1
  if [ -n "${4:-}" ]; then
    _ci_hex64 "$4" || return 1
    _ci_list_add "$(_ci_consumed_full_file "$1")" "$2" "$4" || return 1
  fi
  return 0
}
_ci_list_has() {  # <파일> <정규형 since> <값|빈 값=무관>
  local s h
  [ -f "$1" ] || return 1
  while read -r s h; do
    [ -n "${3:-}" ] && [ "$h" != "$3" ] && continue
    case "$s" in   # 정규형 줄은 글자 비교(빠른 길), 그 밖의 표기만 시각으로 바꿔 비교
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z) [ "$s" = "$2" ] && return 0 ;;
      *) [ "$(console_ms_to_iso "$(console_iso_to_ms "$s")" 2>/dev/null)" = "$2" ] && return 0 ;;
    esac
  done < "$1"
  return 1
}
console_consumed_has() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_consumed_has "$@"; return; fi
  local want; _ci_name_ok "${1:-}" || return 1
  want="$(console_iso_to_ms "${2:-}")" || return 1
  want="$(console_ms_to_iso "$want")" || return 1    # 정규형(UTC 밀리초 …Z)으로 한 번 바꾼다
  _ci_list_has "$(_ci_consumed_file "$1")" "$want" "${3:-}" && return 0
  if [ -n "${4:-}" ]; then _ci_list_has "$(_ci_consumed_full_file "$1")" "$want" "$4" && return 0; fi
  return 1
}
console_consumed_has_since() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_consumed_has_since "$@"; return; fi
  local want; _ci_name_ok "${1:-}" || return 1
  want="$(console_iso_to_ms "${2:-}")" || return 1
  want="$(console_ms_to_iso "$want")" || return 1
  _ci_list_has "$(_ci_consumed_file "$1")" "$want" "" || _ci_list_has "$(_ci_consumed_full_file "$1")" "$want" ""
}

# ---- 기록 파일 -------------------------------------------------------------------------------
console_input_file() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_file "$@"; return; fi; printf '%s/input/%s.json' "$(_ci_dir)" "$1"; }
console_input_rec_lock() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_rec_lock "$@"; return; fi;  # 짧게 쥔다(3초 대기). 10초 넘은 잠금은 죽은 것으로 보고 치운다
  local d i=0 t0=$SECONDS; _ci_name_ok "${1:-}" || return 1
  d="$(_ci_dir)/input/.$1.lock"; coord_mkdirp "${d%/*}"
  until mkdir "$d" 2>/dev/null; do
    if [ $(( $(date +%s) - $(coord_file_mtime "$d" 2>/dev/null || echo 0) )) -ge 10 ]; then
      rmdir "$d" 2>/dev/null
      # 낡은 잠금 폴더가 비워지지 않으면(안에 파일) rmdir 이 계속 실패한다: 30초 상한 뒤 포기하고, 그동안은 0.1초씩 쉰다(CPU 를 붙잡지 않는다)
      [ $((SECONDS - t0)) -ge 30 ] && return 1
      [ -d "$d" ] && sleep 0.1
      continue
    fi
    i=$((i + 1)); [ "$i" -ge 30 ] && return 1
    sleep 0.1
  done
}
console_input_rec_unlock() { if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_rec_unlock "$@"; return; fi; _ci_name_ok "${1:-}" && rmdir "$(_ci_dir)/input/.$1.lock" 2>/dev/null; return 0; }
console_input_write() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_write "$@"; return; fi
  local f; _ci_name_ok "${1:-}" || return 1
  f="$(console_input_file "$1")"
  ( umask 077; mkdir -p "$(dirname "$f")" && printf '%s\n' "$2" > "$f.tmp.$$" && chmod 600 "$f.tmp.$$" && mv -f "$f.tmp.$$" "$f" )
}
CI_MH_REC=""; CI_MH_CONS=1
console_input_mark_handled() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_callg console-input console_input_mark_handled "CI_MH_REC CI_MH_CONS" "$@"; return; fi
  local name="${1:-}" by="${2:-}" want="${3:-}" f cur since sha full new
  CI_MH_REC=""; CI_MH_CONS=1
  _ci_name_ok "$name" || return 4
  case "$by" in coordinator|auto) ;; *) return 4 ;; esac
  f="$(console_input_file "$name")"
  console_input_rec_lock "$name" || return 4
  cur="$(cat "$f" 2>/dev/null)"
  if ! printf '%s' "$cur" | jq -e 'type == "object"' >/dev/null 2>&1; then console_input_rec_unlock "$name"; return 1; fi
  full="$(printf '%s' "$cur" | jq -r '.full // empty | tostring' 2>/dev/null)"
  _ci_hex64 "$full" || full=""
  if [ -n "$want" ] && [ "$full" != "$want" ]; then console_input_rec_unlock "$name"; return 2; fi
  since="$(printf '%s' "$cur" | jq -r '.since // empty | tostring' 2>/dev/null)"
  sha="$(printf '%s' "$cur" | jq -c '.excerpt // []' 2>/dev/null | console_excerpt_sha_json)"
  new="$(printf '%s' "$cur" | jq -c --arg b "$by" --arg a "$(console_now_ms_iso)" '.handled = {by:$b, at:$a}' 2>/dev/null)"
  if [ -z "$new" ] || ! console_input_write "$name" "$new"; then console_input_rec_unlock "$name"; return 4; fi
  console_consumed_add "$name" "$since" "$sha" "$full" || CI_MH_CONS=0
  console_input_rec_unlock "$name"
  CI_MH_REC="$cur"
  return 0
}
console_input_notify() {
 if _jsb_on CONSOLE_INPUT; then DFLOW_CONSOLE_DIR="${DFLOW_CONSOLE_DIR:-}" COORD_CONSOLE_WINDOW_TIMEOUT_S="${COORD_CONSOLE_WINDOW_TIMEOUT_S:-}" COORD_CONSOLE_LANE_LOCK_WAIT_S="${COORD_CONSOLE_LANE_LOCK_WAIT_S:-}" COORD_CONSOLE_SENT_GRACE_S="${COORD_CONSOLE_SENT_GRACE_S:-}" _jsb_call console-input console_input_notify "$@"; return; fi
  local d; _ci_name_ok "${1:-}" || return 1
  d="$(_ci_dir)/input/.notify"; coord_mkdirp "$d"; [ -d "$d" ] && : > "$d/$1"
}
