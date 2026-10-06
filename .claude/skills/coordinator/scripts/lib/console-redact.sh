#!/usr/bin/env bash
# 콘솔 화면 가림·프롬프트 정리(source 용). 정본: ../../references/contract.md §4.1 「화면 수집·가림」·「안전 입력」.
# 비밀이 오피스로 나가는 마지막 방어선이다. 오탐보다 미탐을 더 엄격히 본다. 다른 lib 에 기대지 않는다.
#   console_redact_text     stdin 텍스트에 가림 규칙을 적용해 stdout. 가린 자리는 `[가림]`. 줄마다 먼저 2000바이트(UTF-8
#                           글자 경계)로 자르고(잘린 줄 끝 토막은 가림 — 아래 「잘린 꼬리」) 가린다. 입력 합계가 1MB 를 넘으면
#                           실패(71). 내부 오류면 비정상 종료 코드이고 stdout 에는 아무것도 내지 않는다.
#   console_screen_filter   stdin = 터미널 화면 원문(term_read_screen <h> 40). 입력의 마지막 41줄만 본다(맨 앞 한 줄은 40줄 창
#                           바로 앞 줄로, 이음·여러 줄 판정에만 쓴다). 줄마다: CR 처리 → 2000바이트 자름 → ANSI·제어 문자·
#                           보이지 않는 문자 제거 → 줄 끝 공백 제거 → (잘렸으면) 끝 토막 가림.
#                           자른 뒤 64KB 넘는 줄이면 실패(71)하는 검사는 안전망으로 남아 있다(자른 뒤라 닿지 않는다).
#                           그다음 여러 줄 가림(PEM·YAML 블록) → 줄 이음 → 가림 → 400자(코드포인트) 자름 → 다시 가림 → 마지막
#                           40줄 → 합계 8192바이트(줄바꿈 포함) 초과분을 앞쪽 줄부터 버림 → 앞뒤 빈 줄 제거.
#   console_screen_sha      stdin 의 sha256 hex(64자) 한 줄. openssl dgst -sha256 -r → shasum -a 256 → sha256sum 순. 없으면 종료 코드 1.
#   console_clean_prompt    stdin 프롬프트 본문 정리: 줄바꿈(CR·LF·U+2028·U+2029)·탭 → 공백 하나씩 → 나머지 제어 문자(C0·C1·DEL)와
#                           보이지 않는 문자(아래) 제거(연속 공백은 접지 않는다) → 앞뒤 공백 제거. 종료 코드 0 정상(stdout 한 줄)
#                           · 1 빔(Unicode 공백만 남은 것 포함) · 2 `!` 포함 · 3 2000자(코드포인트) 초과(원문이 32KB 를 넘거나
#                           한 줄이 8000바이트를 넘으면 정리 전에 바로 3) · 4 내부 오류. 0 이 아니면 stdout 에 아무것도 내지 않는다.
#   보이지 않는 문자: U+200B~U+200F · U+202A~U+202E · U+2060~U+2069 · U+FEFF · U+00AD · 결합 문자 U+0300~U+036F.
# 가림 규칙(적용 순서 — Bearer 를 이름=값보다 먼저 가려야 `token: Bearer x` 의 x 가 남지 않는다):
#   PEM 한 줄 · 1 `sk-`+[A-Za-z0-9_-]{16,}(대소문자 무시) · 접두어 토큰 · 2 `dflow_pat_`+공백 아닌 연속 · 3 JWT 세 토막
#   · 5 `Authorization`·`Cookie`(따옴표 허용)`:`/`=` 뒤 줄 나머지, `Bearer` 뒤 값 · 4 이름 구분자 값 · CLI 인자 · .netrc
#   · URL 사용자 칸 · DB user/pass@db · 6 40자 이상 [A-Za-z0-9+/_=-] 연속 중 hex 만이거나 대문자·소문자·숫자 중 둘 이상(경로 모양 제외).
#   접두어 토큰: AIza · gl[a-z]{1,6}- · hf_ · GOCSPX- · sk_live_ · sk_test_ · rk_live_ · rk_test_ · whsec_ · xox[abpr]- · gh[pousr]_
#     · github_pat_ · npm_ · sbp_ · sb_secret_ 뒤 [A-Za-z0-9_-]{16,} 이고 그 꼬리가 대문자·소문자·숫자 중 둘 이상을 섞었으면 전체.
#     (AKIA|ASIA)[A-Z0-9]{16,}. 앞 경계는 보지 않는다(URL 사용자 칸·단어 중간도 가린다).
#   4 이름 구분자 값: 구분자 `=`·`:`·전각 `：`·`＝`(값은 따옴표 안 전체 — 닫는 따옴표 없으면 줄 끝까지 — 또는 공백 전까지),
#     `(`(값이 따옴표일 때만), `,`(이름 바로 뒤가 닫는 따옴표이고 값이 따옴표일 때만). 이름 뒤의 공백·따옴표·`]`·`)` 는 건너뛴다.
#   이름 판정: [A-Za-z0-9_.-] 연속을 camelCase 경계에 `_` 를 넣고 소문자·`-`/`.`→`_` 로 바꾼 뒤
#     ⓐ password·passwd·pwd·passphrase·passcode·secret·token·api_key·apikey·credential·private_key·privatekey·access_key·
#        accesskey·cookie·session·signature 가 들어 있거나 ⓑ `_` 토막 pat·pass·pw·auth·sid·sig 가 있거나 ⓒ camelCase 를 나누기
#        전 이름이 `_key` 로 끝나고(`key` 단독은 아님) 바로 앞 토막이 public·pub 이 아니면 가린다.
#        비교 연산(== === != !==) 뒤 값은 따옴표일 때만 가린다(`<=`·`>=` 는 구분자가 아니다). `tokens`(개수)만 들어 있고 값이 숫자 모양이면 둔다. 이름이 정확히 `PASS` 이고
#        구분자가 `:` 이면(go test 의 `--- PASS: TestX`) 둔다. 한글 이름(비밀번호·패스워드·암호·토큰·시크릿·비번·키)으로 끝나도
#        가리되 단축키·공개키·공개 키 는 둔다.
#   CLI 인자: 줄 처음·공백 뒤의 `--이름 값`·`-이름 값`(이름 판정 또는 이름이 pass 로 끝남) → 값 한 단어(따옴표면 따옴표 안).
#     `-p 값`(숫자·포트 모양 값과 `mkdir -p` 는 둔다), `-p값`(붙여 씀 — -print·-path 같은 알려진 옵션은 둔다), `-u`·`--user`
#     의 `x:y` 의 y. 값이 `-`·`<`·`{`·`$` 로 시작하거나 string·value 같은 자리표시면 둔다.
#   .netrc: 줄에 machine·login·default 토막이 있거나 줄이 password·passwd 로 시작하면 `password`·`passwd` 다음 단어.
#   URL: `://` 뒤 공백·따옴표 전까지의 마지막 `@` 앞이 사용자 칸. `:` 가 있으면 그 뒤부터 `@` 앞까지(포트/경로 모양은 둔다),
#     없으면 사용자 칸 전체(`/`·`?`·`#` 가 들었거나 git 이면 둔다).
#   DB: `user/pass@host` 의 pass(사용자 앞이 `@`·`/` 이거나 토큰에 `://` 가 있거나 host 가 sha256·sha512·v숫자·1~3마디
#     버전·latest·main 같은 참조 이름이거나 앞 단어가 `uses:` 면 둔다),
#     줄에 sqlplus·impdp·expdp·sqlldr·rman 이 있으면 `@` 없는 `user/pass` 도.
#   경로 모양: `/` 3개 이상, `+`·`=` 없음, 모든 토막이 40자 이하이고 대문자가 대문자·숫자 바로 뒤에 오지 않음(AgDataGrid 는 됨).
# 여러 줄 가림(줄 번호 접두 `  4<TAB>`·`4:`·`4 │`·`4→` 와 표 테두리 `│`·`┃`·`║`·`|` 는 건너뛰고 본다):
#   PEM: `-----BEGIN …PRIVATE…` 줄부터 `-----END …-----` 까지(END 가 없으면 입력 끝까지). END 만 있으면 그 줄과 바로 위의
#     base64 모양 줄들. YAML: 이름 판정에 걸린 `이름:` 의 값이 비었거나 `|`·`>` 블록 표시면 이어지는 더 깊은 들여쓰기 줄들.
#   줄 이음: 줄 i 의 끝 [A-Za-z0-9+/_=.-] 연속과 줄 i+1 의 첫 연속을 이어 붙인 것이 가려지고 두 토막이 각각 혼자 가려지거나
#     8자 이상 hex 만이거나 두 종류 이상을 섞었으면 두 토막을 다 가린다. 앞 토막이 40자 이상이고 혼자 가려지면 다음 줄 첫 토막이
#     [A-Za-z0-9+/_=-] 로만 되어 있고(숫자만은 제외) 뒤가 공백·줄 끝일 때 함께 가린다.
#   잘린 꼬리: 2000바이트로 잘린 줄의 끝 [A-Za-z0-9+/_=.-] 연속이 12자 이상이거나 알려진 비밀 접두어로 시작하면 가린다.
# awk 는 LC_ALL=C 바이트 단위로 돌고 시작할 때 바이트 의미(sprintf %c 200 = 1바이트, "가" = 3바이트)를 확인해 아니면 실패한다.
# 이 lib 의 awk 본문은 셸 작은따옴표 안에 있으므로 awk 코드·주석에 작은따옴표 글자를 쓰지 않는다(39 로 비교한다).

# ---------- awk 공용 함수(가림 규칙) ----------
_CONSOLE_REDACT_AWK_LIB='
function _rinit(   i, T, k) {
  for (i = 1; i < 256; i++) ORD[sprintf("%c", i)] = i
  BAD = (length(sprintf("%c", 200)) != 1 || length("가") != 3)
  MASK = "[가림]"; SQ = sprintf("%c", 39); CR = sprintf("%c", 13)
  nkw = split("password passwd pwd passphrase passcode secret token api_key apikey credential private_key privatekey access_key accesskey cookie session signature", KW, " ")
  k = split("pat pass pw auth sid sig", T, " "); for (i = 1; i <= k; i++) TOK[T[i]] = 1
  nko = split("비밀번호 패스워드 암호 토큰 시크릿 비번 키", KO, " ")
  KOX[1] = "단축키"; KOX[2] = "공개키"; KOX[3] = "공개 키"; nkox = 3
  k = split("password passwd pass passphrase pwd pw", T, " "); for (i = 1; i <= k; i++) PLONG[T[i]] = 1
  k = split("print print0 printf prune path perm pthread pipe pie pg pedantic passin passout pubin pubout", T, " "); for (i = 1; i <= k; i++) NOP[T[i]] = 1
  k = split("string strings str value int bool", T, " "); for (i = 1; i <= k; i++) PHV[T[i]] = 1
  k = split("latest main master next beta canary stable HEAD", T, " "); for (i = 1; i <= k; i++) REFW[T[i]] = 1
  npf = split("AIza hf_ GOCSPX- sk_live_ sk_test_ rk_live_ rk_test_ whsec_ xoxa- xoxb- xoxp- xoxr- ghp_ gho_ ghu_ ghs_ ghr_ github_pat_ npm_ sbp_ sb_secret_", PF, " ")
  nst = split("sk- eyJ dflow_ AIza gl hf_ GOCSPX sk_ rk_ whsec xox gh github_ npm_ sbp_ sb_ AKIA ASIA", ST, " ")
}
function _o(s, i) { return (i < 1 || i > length(s)) ? 0 : ORD[substr(s, i, 1)] + 0 }
function _dig(c) { return c >= 48 && c <= 57 }
function _up(c) { return c >= 65 && c <= 90 }
function _lo(c) { return c >= 97 && c <= 122 }
function _sk(c) { return _dig(c) || _up(c) || _lo(c) || c == 95 || c == 45 }
function _id(c) { return _sk(c) || c == 46 }
function _b6(c) { return _sk(c) || c == 43 || c == 47 || c == 61 }
function _sm(c) { return _b6(c) || c == 46 }
function _ws(c) { return c == 32 || c == 9 }
function _qt(c) { return c == 34 || c == 39 || c == 96 }
function _hex(c) { return _dig(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102) }
function _endswith(a, b) { return length(a) >= length(b) && substr(a, length(a) - length(b) + 1) == b }
function _cls(r) { return (r ~ /[A-Z]/) + (r ~ /[a-z]/) + (r ~ /[0-9]/) }
function _cut(s, max,   n, i, c, cnt) {
  n = length(s); if (n <= max) return s
  cnt = 0
  for (i = 1; i <= n; i++) { c = _o(s, i); if (c < 128 || c >= 192) { cnt++; if (cnt > max) return substr(s, 1, i - 1) } }
  return s
}
# 바이트 상한으로 자르되 UTF-8 글자를 쪼개지 않는다
function _cutb(s, max,   i) {
  if (length(s) <= max) return s
  i = max + 1
  while (i > 1 && _o(s, i) >= 128 && _o(s, i) < 192) i--
  return substr(s, 1, i - 1)
}
function _cpcount(s,   n, i, c, cnt) {
  n = length(s); cnt = 0
  for (i = 1; i <= n; i++) { c = _o(s, i); if (c < 128 || c >= 192) cnt++ }
  return cnt
}
# 보이지 않는 문자면 그 바이트 수, 아니면 0
function _inv(c, c1, c2) {
  if (c == 226) {
    if (c1 == 128 && ((c2 >= 139 && c2 <= 143) || (c2 >= 170 && c2 <= 174))) return 3
    if (c1 == 129 && c2 >= 160 && c2 <= 169) return 3
    return 0
  }
  if (c == 239 && c1 == 187 && c2 == 191) return 3
  if (c == 194 && c1 == 173) return 2
  if (c == 204 && c1 >= 128 && c1 <= 191) return 2
  if (c == 205 && c1 >= 128 && c1 <= 175) return 2
  return 0
}
# 표 테두리(│ ┃ ║) 3바이트인가
function _bar3(s, j,   c1, c2) {
  if (_o(s, j) != 226) return 0
  c1 = _o(s, j + 1); c2 = _o(s, j + 2)
  return (c1 == 148 && (c2 == 130 || c2 == 131)) || (c1 == 149 && c2 == 145)
}
# 줄 번호 접두·테두리·앞 공백을 건너뛴 첫 내용 위치. PQ = 줄 번호 접두 바로 뒤(없으면 1)
function _pfx(s,   n, k, j, j2, c) {
  n = length(s); k = 1; PQ = 1
  while (k <= n && _ws(_o(s, k))) k++
  j = k; while (j <= n && _dig(_o(s, j))) j++
  if (j > k) {
    c = _o(s, j)
    if (c == 9 || c == 58) { k = j + 1; PQ = k }
    else {
      j2 = j; while (j2 <= n && _o(s, j2) == 32) j2++
      if (_bar3(s, j2) || (_o(s, j2) == 226 && _o(s, j2 + 1) == 134 && _o(s, j2 + 2) == 146)) { k = j2 + 3; PQ = k }
    }
  }
  while (k <= n) { c = _o(s, k); if (_ws(c) || c == 124) k++; else if (_bar3(s, k)) k += 3; else break }
  return k
}
# 줄 끝 공백·테두리를 뺀 마지막 내용 위치
function _tend(s,   e) {
  e = length(s)
  while (1) {
    while (e >= 1 && (_ws(_o(s, e)) || _o(s, e) == 124)) e--
    if (e >= 3 && _bar3(s, e - 2)) { e -= 3; continue }
    break
  }
  return e
}
# 잘린 줄의 끝 토막 가림
function _tailprot(s,   j, t, x) {
  j = length(s); while (j >= 1 && _sm(_o(s, j))) j--
  t = substr(s, j + 1); if (t == "") return s
  if (length(t) >= 12) return substr(s, 1, j) MASK
  for (x = 1; x <= nst; x++) if (substr(t, 1, length(ST[x])) == ST[x]) return substr(s, 1, j) MASK
  return s
}
# 이름 정규화: camelCase 경계에 _ · 소문자 · - . 를 _ 로
function _normname(raw,   n, i, c, p, o) {
  o = ""; n = length(raw); p = 0
  for (i = 1; i <= n; i++) { c = _o(raw, i); if (_up(c) && (_lo(p) || _dig(p))) o = o "_"; o = o substr(raw, i, 1); p = c }
  o = tolower(o); gsub(/[-.]/, "_", o)
  NMRAW = tolower(raw); gsub(/[-.]/, "_", NMRAW)
  return o
}
# 이름 판정: 0 아님 · 1 가림 · 2 tokens(숫자 값이면 둠) · 3 camelCase …Key(값이 따옴표일 때만).
#   nm 은 _normname 결과(직전 호출의 NMRAW 를 함께 본다). _key 끝 규칙은 camelCase 를 나누기 전 이름(NMRAW)으로 1,
#   나눈 뒤에만 key 로 끝나면 3(queryKey: [..]·rowKey={..} 같은 코드는 두고 "encryptionKey": "x" 는 가린다)
function _namehit(nm,   t, x, k, T, last, prev) {
  if (nm == "") return 0
  t = nm; gsub(/tokens/, "", t)
  for (x = 1; x <= nkw; x++) if (index(t, KW[x])) return 1
  k = split(nm, T, "_")
  for (x = 1; x <= k; x++) if (T[x] in TOK) return 1
  k = split(NMRAW, T, "_"); last = ""; prev = ""
  for (x = 1; x <= k; x++) if (T[x] != "") { prev = last; last = T[x] }
  if (last == "key" && prev != "" && prev != "public" && prev != "pub") return 1
  k = split(nm, T, "_"); last = ""; prev = ""
  for (x = 1; x <= k; x++) if (T[x] != "") { prev = last; last = T[x] }
  if (last == "key" && prev != "" && prev != "public" && prev != "pub") return 3
  if (index(nm, "tokens")) return 2
  return 0
}
# 규칙 1: sk- 키
function _r_sk(s,   out, p, j, n) {
  out = ""
  while ((p = index(tolower(s), "sk-")) > 0) {
    n = length(s); j = p + 3
    while (j <= n && _sk(_o(s, j))) j++
    if (j - p - 3 >= 16) { out = out substr(s, 1, p - 1) MASK; s = substr(s, j) }
    else { out = out substr(s, 1, j - 1); s = substr(s, j) }
  }
  return out s
}
# 접두어 뒤 [A-Za-z0-9_-]{16,} 이고 두 종류 이상 섞였으면 끝 다음 위치, 아니면 0
function _tok16(s, a,   j, n) {
  n = length(s); j = a
  while (j <= n && _sk(_o(s, j))) j++
  if (j - a >= 16 && _cls(substr(s, a, j - a)) >= 2) return j
  return 0
}
# 접두어 토큰
function _r_pfx(s,   x, P, p, j, k, n, out, L) {
  for (x = 1; x <= npf; x++) {
    P = PF[x]; L = length(P); out = ""
    while ((p = index(s, P)) > 0) {
      if ((j = _tok16(s, p + L))) { out = out substr(s, 1, p - 1) MASK; s = substr(s, j) }
      else { out = out substr(s, 1, p + L - 1); s = substr(s, p + L) }
    }
    s = out s
  }
  out = ""
  while ((p = index(s, "gl")) > 0) {
    n = length(s); j = p + 2
    while (j <= n && j - p - 2 < 7 && _lo(_o(s, j))) j++
    if (j > p + 2 && j - p - 2 <= 6 && _o(s, j) == 45 && (k = _tok16(s, j + 1))) { out = out substr(s, 1, p - 1) MASK; s = substr(s, k) }
    else { out = out substr(s, 1, p + 1); s = substr(s, p + 2) }
  }
  s = out s
  for (x = 1; x <= 2; x++) {
    P = (x == 1) ? "AKIA" : "ASIA"; out = ""
    while ((p = index(s, P)) > 0) {
      n = length(s); j = p + 4
      while (j <= n && (_up(_o(s, j)) || _dig(_o(s, j)))) j++
      if (j - p - 4 >= 16) { out = out substr(s, 1, p - 1) MASK; s = substr(s, j) }
      else { out = out substr(s, 1, p + 3); s = substr(s, p + 4) }
    }
    s = out s
  }
  return s
}
# 규칙 2: D Flow PAT
function _r_pat(s,   out, p, j, n) {
  out = ""
  while ((p = index(tolower(s), "dflow_pat_")) > 0) {
    n = length(s); j = p + 10
    while (j <= n && !_ws(_o(s, j))) j++
    if (j > p + 10) { out = out substr(s, 1, p - 1) MASK; s = substr(s, j) }
    else { out = out substr(s, 1, p + 9); s = substr(s, p + 10) }
  }
  return out s
}
# 규칙 3: JWT. 실패하면 훑은 끝까지 건너뛴다(같은 연속 안의 다른 eyJ 도 같은 끝에서 같은 이유로 실패한다)
function _r_jwt(s,   out, p, j, k, n, ok, nx) {
  out = ""
  while ((p = index(s, "eyJ")) > 0) {
    n = length(s); j = p + 3; ok = 0
    while (j <= n && _sk(_o(s, j))) j++
    nx = j
    if (j - p - 3 >= 8 && _o(s, j) == 46) {
      k = j + 1; while (k <= n && _sk(_o(s, k))) k++
      if (k - j - 1 >= 8 && _o(s, k) == 46) { k++; while (k <= n && _sk(_o(s, k))) k++; ok = 1 }
      else nx = j + 1
    }
    if (ok) { out = out substr(s, 1, p - 1) MASK; s = substr(s, k) }
    else { out = out substr(s, 1, nx - 1); s = substr(s, nx) }
  }
  return out s
}
# 이름 뒤 따옴표·공백 후 : 또는 = 이면 줄 나머지를 가린다(Authorization·Cookie)
function _r_hdr(s, name,   out, p, j, k, n, c, L, low) {
  out = ""; L = length(name)
  while ((p = index(tolower(s), name)) > 0) {
    n = length(s); j = p + L; c = _o(s, j)
    if (_qt(c)) j++
    while (j <= n && _ws(_o(s, j))) j++
    c = _o(s, j)
    if (c == 58 || c == 61) {
      k = j + 1; while (k <= n && _ws(_o(s, k))) k++
      if (k <= n && substr(s, k) != MASK) s = substr(s, 1, k - 1) MASK
      out = out s; s = ""; break
    }
    out = out substr(s, 1, p + L - 1); s = substr(s, p + L)
  }
  return out s
}
# 규칙 5: Authorization·Cookie 헤더 · Bearer 값
function _r_auth(s,   out, p, k, m, n, v) {
  s = _r_hdr(s, "authorization"); s = _r_hdr(s, "cookie")
  out = ""
  while ((p = index(tolower(s), "bearer")) > 0) {
    n = length(s); k = p + 6
    if (_ws(_o(s, k))) {
      while (k <= n && _ws(_o(s, k))) k++
      m = k; while (m <= n && !_ws(_o(s, m))) m++
      v = substr(s, k, m - k)
      if (v != "" && v != MASK) { out = out substr(s, 1, k - 1) MASK; s = substr(s, m); continue }
    }
    out = out substr(s, 1, p + 5); s = substr(s, p + 6)
  }
  return out s
}
# 규칙 4 이름 판정(구분자 위치 i). sep 는 구분자 바이트(58 :, 61 =, 44 ,, 40 (, 239 전각)
function _kvname(s, i, sep,   j, e, c, raw, w, x, b) {
  j = i - 1
  if (sep == 44) {
    while (j >= 1 && _ws(_o(s, j))) j--
    if (!_qt(_o(s, j))) return 0
  }
  while (j >= 1) { c = _o(s, j); if (_ws(c) || _qt(c) || c == 93 || c == 41) j--; else break }
  e = j
  while (j >= 1 && _id(_o(s, j))) j--
  if (e > j) {
    raw = substr(s, j + 1, e - j)
    if (raw == "PASS" && sep == 58) return 0
    return _namehit(_normname(raw))
  }
  if (e < 1) return 0
  b = e - 20; if (b < 1) b = 1; w = substr(s, b, e - b + 1)
  for (x = 1; x <= nkox; x++) if (_endswith(w, KOX[x])) return 0
  for (x = 1; x <= nko; x++) if (_endswith(w, KO[x])) return 1
  return 0
}
# 규칙 4: 이름 구분자 값
function _r_kv(s,   n, i, st, out, c, d, hit, k, q, m, v, sw, qonly) {
  n = length(s); out = ""; st = 1; i = 1
  while (i <= n) {
    c = _o(s, i); sw = 0; qonly = 0
    # 비교(== === != !==)는 값이 따옴표일 때만. <= >= 와 연산자 뒤쪽 = 는 구분자가 아니다
    if (c == 61 && ((d = _o(s, i - 1)) == 61 || d == 33 || d == 60 || d == 62)) { i++; continue }
    if ((c == 61 || c == 33) && _o(s, i + 1) == 61) {
      sw = 1; while (_o(s, i + sw) == 61) sw++
      if ((hit = _kvname(s, i, 61))) {
        k = i + sw; while (k <= n && _ws(_o(s, k))) k++
        q = _o(s, k)
        if (_qt(q)) {
          m = k + 1; while (m <= n && _o(s, m) != q) m++
          v = substr(s, k + 1, m - k - 1)
          if (v != "" && v != MASK) { out = out substr(s, st, k - st + 1) MASK; st = m }
          i = m + 1; continue
        }
      }
      i += sw; continue
    }
    if (c == 61 || c == 58) sw = 1
    else if (c == 44 || c == 40) { sw = 1; qonly = 1 }
    else if (c == 239 && _o(s, i + 1) == 188 && (_o(s, i + 2) == 154 || _o(s, i + 2) == 157)) sw = 3
    if (sw && (hit = _kvname(s, i, c))) {
      k = i + sw
      if (!qonly) while (k <= n && (_o(s, k) == 61 || _o(s, k) == 58 || _o(s, k) == 62)) k++
      while (k <= n && _ws(_o(s, k))) k++
      if (k <= n) {
        q = _o(s, k)
        if (_qt(q)) {
          m = k + 1; while (m <= n && _o(s, m) != q) m++
          v = substr(s, k + 1, m - k - 1)
          if (v != "" && v != MASK) { out = out substr(s, st, k - st + 1) MASK; st = m }
          i = m + 1; continue
        }
        if (!qonly && hit != 3) {
          m = k; while (m <= n && !_ws(_o(s, m))) m++
          v = substr(s, k, m - k)
          if (index(v, MASK) != 1 && !(hit == 2 && v ~ /^[0-9][0-9.,_]*[kKmM]?$/)) { out = out substr(s, st, k - st) MASK; st = m }
          i = m; continue
        }
      }
    }
    i += (sw ? sw : 1)
  }
  return out substr(s, st)
}
# CLI 값 한 단어의 끝(다음 위치)을 돌려준다. 따옴표면 닫는 따옴표 다음(없으면 줄 끝). VS·VE 에 가릴 범위
function _word(s, k,   n, q, m) {
  n = length(s); q = _o(s, k)
  if (_qt(q)) { m = k + 1; while (m <= n && _o(s, m) != q) m++; VS = k + 1; VE = m - 1; return (m <= n) ? m + 1 : m }
  m = k; while (m <= n && !_ws(_o(s, m))) m++
  VS = k; VE = m - 1; return m
}
function _prevword(s, i,   j, e) {
  j = i - 1; while (j >= 1 && _ws(_o(s, j))) j--
  e = j; while (j >= 1 && !_ws(_o(s, j))) j--
  return substr(s, j + 1, e - j)
}
# CLI 값으로 가릴 만한가(공통 제외)
function _cliok(v,   f) {
  if (v == "") return 0
  f = substr(v, 1, 1)
  if (f == "-" || f == "<" || f == "{" || f == "$" || index(v, MASK) == 1) return 0
  if (tolower(v) in PHV) return 0
  return 1
}
function _portlike(v) { return v ~ /^[0-9][0-9.:]*(\/(tcp|udp|sctp))?$/ }
# CLI 인자: --이름 값 · -이름 값 · -p · -u
function _r_cli(s,   n, i, st, out, j, k, nm, lnm, h, dbl, m, v, w, c, a) {
  n = length(s); out = ""; st = 1; i = 1
  while (i <= n) {
    if (_o(s, i) != 45 || (i > 1 && !_ws(_o(s, i - 1)))) { i++; continue }
    dbl = (_o(s, i + 1) == 45); j = i + 1 + dbl
    k = j; while (k <= n && _sk(_o(s, k))) k++
    nm = substr(s, j, k - j)
    if (nm == "") { i = k > i ? k : i + 1; continue }
    c = _o(s, k)
    lnm = tolower(nm)
    # -u · --user : x:y 의 y
    if ((dbl && lnm == "user") || (!dbl && substr(nm, 1, 1) == "u")) {
      a = 0
      if (dbl || nm == "u") { if (_ws(c) || (dbl && c == 61)) { a = k + 1; while (a <= n && _ws(_o(s, a))) a++ } }
      else a = j + 1
      if (a && a <= n) {
        w = _word(s, a); v = substr(s, VS, VE - VS + 1); m = index(v, ":")
        if (m && m < length(v) && index(v, MASK) == 0) { out = out substr(s, st, VS + m - st) MASK; st = VE + 1 }
        if (m) { i = w; continue }
      }
    }
    # -p 값 · -p값(붙여 씀). -password 같은 긴 이름은 아래 규칙으로
    if (!dbl && substr(nm, 1, 1) == "p" && !(lnm in PLONG)) {
      if (nm == "p") {
        if (_ws(c)) {
          a = k; while (a <= n && _ws(_o(s, a))) a++
          if (a <= n) {
            w = _word(s, a); v = substr(s, VS, VE - VS + 1)
            if (_cliok(v) && !_portlike(v) && _prevword(s, i) != "mkdir") { out = out substr(s, st, VS - st) MASK; st = VE + 1 }
            i = w; continue
          }
        }
        i = k; continue
      }
      if (!(lnm in NOP)) {
        w = _word(s, j + 1); v = substr(s, VS, VE - VS + 1)
        if (v != "" && index(v, MASK) != 1 && !_portlike(v)) { out = out substr(s, st, VS - st) MASK; st = VE + 1 }
        i = w; continue
      }
      i = k; continue
    }
    # --이름 값 · -이름 값
    if (dbl || length(nm) > 1) {
      h = _namehit(_normname(nm)); if (h == 3) h = 0
      if ((h || _endswith(lnm, "pass")) && _ws(c)) {
        a = k; while (a <= n && _ws(_o(s, a))) a++
        if (a <= n) {
          w = _word(s, a); v = substr(s, VS, VE - VS + 1)
          if (_cliok(v) && !(h == 2 && v ~ /^[0-9][0-9.,_]*[kKmM]?$/)) { out = out substr(s, st, VS - st) MASK; st = VE + 1 }
          i = w; continue
        }
      }
    }
    i = k
  }
  return out substr(s, st)
}
# .netrc 형식: password X · passwd X
function _r_netrc(s,   L, f, out, p, n, j, k, a, w, v, x, P) {
  if (!index(s, "passw")) return s
  L = " " s " "; gsub(/\t/, " ", L)
  f = s; sub(/^[ \t]+/, "", f); sub(/[ \t].*$/, "", f)
  if (!(index(L, " machine ") || index(L, " login ") || index(L, " default ") || f == "password" || f == "passwd")) return s
  for (x = 1; x <= 2; x++) {
    P = (x == 1) ? "password" : "passwd"; out = ""
    while ((p = index(s, P)) > 0) {
      n = length(s); j = p + length(P)
      if ((p == 1 || _ws(_o(s, p - 1))) && _ws(_o(s, j))) {
        a = j; while (a <= n && _ws(_o(s, a))) a++
        if (a <= n) {
          w = _word(s, a); v = substr(s, VS, VE - VS + 1)
          if (v != "" && index(v, MASK) != 1) { out = out substr(s, 1, VS - 1) MASK; s = substr(s, VE + 1); continue }
        }
      }
      out = out substr(s, 1, j - 1); s = substr(s, j)
    }
    s = out s
  }
  return s
}
# URL 의 사용자 칸(공백·따옴표 전까지의 마지막 @ 앞)
function _r_url(s,   out, st, p, q, j, n, c, at, a, ui, colon, user, pw, hit, b, E, A) {
  out = ""; st = 1; q = 1; n = length(s); E = 0
  while ((p = index(substr(s, q), "://")) > 0) {
    p += q - 1; a = p + 3
    # 같은 토막(공백·따옴표 전까지) 안이면 마지막 @ 를 다시 훑지 않는다(:// 반복 입력의 O(n²) 방지)
    if (a > E) { A = 0; for (j = a; j <= n; j++) { c = _o(s, j); if (_ws(c) || _qt(c) || c == 60 || c == 62) break; if (c == 64) A = j } E = j }
    at = (A > a) ? A : 0
    hit = 0
    if (at) {
      ui = substr(s, a, at - a); colon = index(ui, ":")
      if (colon) {
        user = substr(ui, 1, colon - 1); pw = substr(ui, colon + 1)
        if (user !~ /[\/?#]/ && pw != "" && pw != MASK && pw !~ /^[0-9]+\//) { hit = 1; b = a + colon }
      } else if (ui !~ /[\/?#]/ && ui != MASK && ui != "git") { hit = 1; b = a }
    }
    if (hit) { out = out substr(s, st, b - st) MASK; st = at; q = at }
    else if (!at) q = E
    else q = a
    if (q <= p) q = p + 1
  }
  return out substr(s, st)
}
# DB 접속 user/pass@db
function _r_dbup(s,   out, re, p, n, sl, at, pre, ts, te, tok, pw, host, L) {
  out = ""; re = "[A-Za-z0-9_.$-]+/[^ \t/@]+@[A-Za-z0-9_.-]"
  while (match(s, re)) {
    p = RSTART; at = RSTART + RLENGTH - 2; n = length(s)
    sl = p; while (_o(s, sl) != 47) sl++
    pre = _o(s, p - 1); tok = ""
    if (index(s, "://")) {
      ts = p; while (ts > 1 && !_ws(_o(s, ts - 1))) ts--
      te = at; while (te <= n && !_ws(_o(s, te))) te++
      tok = substr(s, ts, te - ts)
    }
    pw = substr(s, sl + 1, at - sl - 1)
    te = at + 1; while (te <= n && _id(_o(s, te))) te++
    host = substr(s, at + 1, te - at - 1)
    # 버전·브랜치 참조(actions/checkout@v4 · x/y@1.2 · x/y@latest)·이미지 다이제스트는 둔다
    if (pre != 47 && pre != 64 && !index(tok, "://") && host !~ /^sha(256|512)/ && host !~ /^v[0-9]/ && host !~ /^[0-9]+(\.[0-9]+)?(\.[0-9]+)?$/ \
        && !(host in REFW) && _prevword(s, p) != "uses:" && index(pw, MASK) == 0) { out = out substr(s, 1, sl) MASK; s = substr(s, at) }
    else { out = out substr(s, 1, at); s = substr(s, at + 1) }
  }
  s = out s
  L = " " tolower(s) " "
  if (L !~ /[^a-z0-9_](sqlplus|impdp|expdp|sqlldr|rman)[^a-z0-9_]/) return s
  out = ""; re = "[A-Za-z0-9_.$-]+/[^ \t/@]+"
  while (match(s, re)) {
    p = RSTART; te = RSTART + RLENGTH; pre = _o(s, p - 1)
    sl = p; while (_o(s, sl) != 47) sl++
    pw = substr(s, sl + 1, te - sl - 1)
    if ((p == 1 || _ws(pre) || pre == 61) && (te > length(s) || _ws(_o(s, te)) || _o(s, te) == 64) && index(pw, MASK) == 0) { out = out substr(s, 1, sl) MASK; s = substr(s, te) }
    else { out = out substr(s, 1, te - 1); s = substr(s, te) }
  }
  return out s
}
# PEM 한 줄 안의 BEGIN…END
function _privbegin(s, b,   r, e) {
  r = substr(s, b + 10); e = index(r, "-----")
  if (!e) return 1
  return index(substr(r, 1, e), "PRIVATE") > 0
}
function _r_pem(s,   b, r, e, P, k) {
  b = index(s, "-----BEGIN"); if (!b || !_privbegin(s, b)) return s
  r = substr(s, b + 10); e = index(r, "-----END")
  if (!e) return substr(s, 1, b - 1) MASK
  P = b + 10 + e - 1 + 8; k = index(substr(s, P), "-----")
  if (!k) return substr(s, 1, b - 1) MASK
  return substr(s, 1, b - 1) MASK substr(s, P + k - 1 + 5)
}
# 규칙 6: 긴 base64·hex
function _wordy(w,   n) {
  n = length(w); if (n > 40) return 0
  if (n >= 40 && _longhit(w)) return 0
  if (w ~ /[A-Z0-9][A-Z]/) return 0
  return 1
}
function _pathlike(r,   k, x, segs) {
  if (index(r, "+") || index(r, "=")) return 0
  k = split(r, segs, "/"); if (k < 4) return 0
  for (x = 1; x <= k; x++) if (!_wordy(segs[x])) return 0
  return 1
}
function _longhit(r) {
  if (r ~ /^[0-9A-Fa-f]+$/) return 1
  if (_cls(r) < 2) return 0
  return !_pathlike(r)
}
function _r_long(s,   out, i, j, n, st) {
  out = ""; n = length(s); i = 1; st = 1
  while (i <= n) {
    if (!_b6(_o(s, i))) { i++; continue }
    j = i; while (j <= n && _b6(_o(s, j))) j++
    if (j - i >= 40 && _longhit(substr(s, i, j - i))) { out = out substr(s, st, i - st) MASK; st = j }
    i = j
  }
  return out substr(s, st)
}
function redact(s) {
  s = _r_pem(s); s = _r_sk(s); s = _r_pfx(s); s = _r_pat(s); s = _r_jwt(s); s = _r_auth(s); s = _r_kv(s)
  s = _r_cli(s); s = _r_netrc(s); s = _r_url(s); s = _r_dbup(s)
  return _r_long(s)
}
# 줄 이음 토막 자격: 혼자서도 가려지거나, 8자 이상 hex 만이거나, 대문자·소문자·숫자 중 둘 이상을 섞은 토막
function _fragok(f) {
  if (redact(f) != f) return 1
  return (f ~ /^[0-9A-Fa-f]+$/ && length(f) >= 8) || _cls(f) >= 2
}
# 줄 이음: 꺾인 비밀의 두 토막을 함께 가린다(A[1..n] 을 바꾼다)
function _seam(A, n,   i, j, j2, k, m, e, t, h, ok, TS, TE, HO, HE) {
  for (i = 1; i < n; i++) {
    e = _tend(A[i]); j = e; while (j >= 1 && _sm(_o(A[i], j))) j--
    t = substr(A[i], j + 1, e - j); if (t == "") continue
    k = _pfx(A[i + 1]); m = length(A[i + 1])
    j2 = k; while (j2 <= m && _sm(_o(A[i + 1], j2))) j2++
    h = substr(A[i + 1], k, j2 - k); if (h == "") continue
    ok = _fragok(t) && _fragok(h) && redact(t h) != t h
    if (!ok && length(t) >= 40 && h ~ /^[A-Za-z0-9+\/_=-]+$/ && h !~ /^[0-9]+$/ && (j2 > m || _ws(_o(A[i + 1], j2))) && redact(t) != t) ok = 1
    if (ok) { TS[i] = j + 1; TE[i] = e; HO[i + 1] = k; HE[i + 1] = j2 - 1 }
  }
  for (i = 1; i <= n; i++) {
    if ((i in TS) && (i in HO) && HE[i] >= TS[i]) { A[i] = substr(A[i], 1, HO[i] - 1) MASK substr(A[i], TE[i] + 1); continue }
    if (i in TS) A[i] = substr(A[i], 1, TS[i] - 1) MASK substr(A[i], TE[i] + 1)
    if (i in HO) A[i] = substr(A[i], 1, HO[i] - 1) MASK substr(A[i], HE[i] + 1)
  }
}
function _b64line(s,   k, e, c) {
  k = _pfx(s); e = _tend(s); if (e < k) return 0
  c = substr(s, k, e - k + 1)
  return c ~ /^[A-Za-z0-9+\/=]+$/
}
function _maskbody(s,   k) { k = _pfx(s); if (k > length(s)) return s; return substr(s, 1, k - 1) MASK }
function _endrest(s, e,   k) { k = index(substr(s, e + 8), "-----"); return k ? substr(s, e + 8 + k - 1 + 5) : "" }
function _yamlkey(s, pk,   c, q, e, key, rest) {
  c = substr(s, pk)
  if (substr(c, 1, 2) == "- ") c = substr(c, 3)
  q = substr(c, 1, 1)
  if (q == "\"" || q == SQ) { e = index(substr(c, 2), q); if (!e) return 0; key = substr(c, 2, e - 1); rest = substr(c, e + 2) }
  else { if (!match(c, /^[A-Za-z0-9_.-]+/)) return 0; key = substr(c, 1, RLENGTH); rest = substr(c, RLENGTH + 1) }
  if (substr(rest, 1, 1) != ":") return 0
  rest = substr(rest, 2); sub(/^[ \t]+/, "", rest)
  if (substr(rest, 1, 1) == "#") rest = ""
  sub(/[ \t]+#.*$/, "", rest); sub(/[ \t]+$/, "", rest)
  if (rest != "" && rest !~ /^[|>][-+0-9]*$/) return 0
  return _namehit(_normname(key)) == 1
}
# 여러 줄 가림: PEM 블록 · YAML 블록(A[1..n] 을 바꾼다)
function _multi(A, n,   i, s, b, e, st, k, ya, base, pk, ind) {
  st = 0
  for (i = 1; i <= n; i++) {
    s = A[i]
    if (st) {
      e = index(s, "-----END")
      if (e) { A[i] = substr(s, 1, _pfx(s) - 1) MASK _endrest(s, e); st = 0 }
      else A[i] = _maskbody(s)
      continue
    }
    b = index(s, "-----BEGIN")
    if (b && _privbegin(s, b)) {
      if (!index(substr(s, b + 10), "-----END")) { A[i] = substr(s, 1, b - 1) MASK; st = 1 }
      continue
    }
    e = index(s, "-----END")
    if (e && index(substr(s, e), "PRIVATE")) {
      A[i] = substr(s, 1, _pfx(s) - 1) MASK _endrest(s, e)
      for (k = i - 1; k >= 1 && _b64line(A[k]); k--) A[k] = _maskbody(A[k])
    }
  }
  ya = 0
  for (i = 1; i <= n; i++) {
    s = A[i]; pk = _pfx(s); ind = pk - PQ
    if (ya) {
      if (_tend(s) < pk) continue
      if (ind > base) { A[i] = substr(s, 1, pk - 1) MASK; continue }
      ya = 0
    }
    if (_yamlkey(s, pk)) { ya = 1; base = ind }
  }
}
'

# ---------- awk 본문 ----------
_CONSOLE_REDACT_AWK_TEXT='
BEGIN { _rinit() }
{
  TOT += length($0) + 1
  if (TOT > 1048576) { OVER = 1; exit }
  s = _cutb($0, 2000); if (s != $0) s = _tailprot(s)
  L[NR] = s
}
END {
  if (BAD) exit 70
  if (OVER) exit 71
  for (i = 1; i <= NR; i++) if (length(L[i]) > 65536) exit 71
  _multi(L, NR); _seam(L, NR)
  for (i = 1; i <= NR; i++) print redact(L[i])
}
'

_CONSOLE_REDACT_AWK_SCREEN='
# 화면 한 줄 정리. 원문은 이미 CR 처리 뒤 2000바이트로 잘려 있다
function _scr(s,   n, i, c, d, e, k, x, out, st) {
  out = ""; n = length(s); i = 1; st = 1
  while (i <= n) {
    c = _o(s, i)
    if (c == 27) {
      out = out substr(s, st, i - st); d = _o(s, i + 1)
      if (d == 91) { k = i + 2; while (k <= n && !(_o(s, k) >= 64 && _o(s, k) <= 126)) k++; i = k + 1 }
      else if (d == 93 || d == 80 || d == 88 || d == 94 || d == 95) {
        k = i + 2
        while (k <= n) { e = _o(s, k); if (e == 7) { k++; break } if (e == 27 && _o(s, k + 1) == 92) { k += 2; break } k++ }
        i = k
      }
      else if (d >= 32 && d <= 47) { k = i + 1; while (k <= n && _o(s, k) >= 32 && _o(s, k) <= 47) k++; i = k + 1 }
      else if (d >= 128) i++
      else i += 2
      st = i; continue
    }
    if (c == 194 && _o(s, i + 1) >= 128 && _o(s, i + 1) <= 159) { out = out substr(s, st, i - st); i += 2; st = i; continue }
    if (c >= 194 && (x = _inv(c, _o(s, i + 1), _o(s, i + 2)))) { out = out substr(s, st, i - st); i += x; st = i; continue }
    if ((c < 32 && c != 9) || c == 127) { out = out substr(s, st, i - st); i++; st = i; continue }
    i++
  }
  out = out substr(s, st)
  sub(/[ \t]+$/, "", out)
  return out
}
BEGIN { _rinit(); CRT = CR "+$" }
{ L[NR] = $0; if (NR > 41) delete L[NR - 41] }
END {
  if (BAD) exit 70
  start = NR - 40; if (start < 1) start = 1
  m = 0
  for (i = start; i <= NR; i++) {
    s = L[i]
    sub(CRT, "", s)
    if (index(s, CR)) { k = split(s, P, CR); s = P[k] }
    t = _cutb(s, 2000); cut = (t != s)
    t = _scr(t); if (cut) t = _tailprot(t)
    if (length(t) > 65536) exit 71
    R[++m] = t
  }
  _multi(R, m); _seam(R, m)
  for (i = 1; i <= m; i++) R[i] = redact(_cut(redact(R[i]), 400))
  first = m - 39; if (first < 1) first = 1
  total = 0; for (i = first; i <= m; i++) total += length(R[i]) + 1
  while (total > 8192 && first <= m) { total -= length(R[first]) + 1; first++ }
  last = m
  while (first <= last && R[first] == "") first++
  while (last >= first && R[last] == "") last--
  for (i = first; i <= last; i++) print R[i]
}
'

_CONSOLE_PROMPT_AWK='
# 한 토막(글자 경계에서 자른 1024바이트 이하) 정리
function _pclean(T,   n, i, c, x, out, st) {
  n = length(T); out = ""; i = 1; st = 1
  while (i <= n) {
    c = _o(T, i)
    if (c == 13 || c == 9) { out = out substr(T, st, i - st) " "; i++; st = i; continue }
    if (c == 226 && _o(T, i + 1) == 128 && (_o(T, i + 2) == 168 || _o(T, i + 2) == 169)) { out = out substr(T, st, i - st) " "; i += 3; st = i; continue }
    if (c == 194 && _o(T, i + 1) >= 128 && _o(T, i + 1) <= 159) { out = out substr(T, st, i - st); i += 2; st = i; continue }
    if (c >= 194 && (x = _inv(c, _o(T, i + 1), _o(T, i + 2)))) { out = out substr(T, st, i - st); i += x; st = i; continue }
    if (c < 32 || c == 127) { out = out substr(T, st, i - st); i++; st = i; continue }
    i++
  }
  return out substr(T, st)
}
# Unicode 공백(U+00A0 U+1680 U+2000~U+200A U+202F U+205F U+3000)과 ASCII 공백만으로 되었는가
function _onlysp(s,   n, i, c, c1, c2) {
  n = length(s); i = 1
  while (i <= n) {
    c = _o(s, i); c1 = _o(s, i + 1); c2 = _o(s, i + 2)
    if (c == 32) { i++; continue }
    if (c == 194 && c1 == 160) { i += 2; continue }
    if (c == 225 && c1 == 154 && c2 == 128) { i += 3; continue }
    if (c == 226 && c1 == 128 && ((c2 >= 128 && c2 <= 138) || c2 == 175)) { i += 3; continue }
    if (c == 226 && c1 == 129 && c2 == 159) { i += 3; continue }
    if (c == 227 && c1 == 128 && c2 == 128) { i += 3; continue }
    return 0
  }
  return 1
}
BEGIN { _rinit() }
{
  TOT += length($0) + 1
  if (TOT > 32769 || length($0) > 8000) { BIG = 1; exit }
  T = (NR == 1) ? $0 : T " " $0
}
END {
  if (BAD) exit 70
  if (BIG) { printf "3\n"; exit 0 }
  n = length(T); out = ""; p = 1
  while (p <= n) {
    q = p + 1024; if (q > n + 1) q = n + 1
    while (q <= n && q > p + 1 && _o(T, q) >= 128 && _o(T, q) < 192) q--
    out = out _pclean(substr(T, p, q - p)); p = q
  }
  sub(/^ +/, "", out); sub(/ +$/, "", out)
  code = 0
  if (out == "" || _onlysp(out)) code = 1
  else if (index(out, "!") > 0) code = 2
  else if (_cpcount(out) > 2000) code = 3
  printf "%d\n", code
  if (code == 0) printf "%s", out
}
'

# _console_awk <본문> — stdin 을 NUL 제거 뒤 awk 로 돌린다. 모두 성공했을 때만 stdout 에 낸다.
_console_awk() {
  local _out _rc
  _out="$(set -o pipefail; LC_ALL=C tr -d '\000' | LC_ALL=C awk "$_CONSOLE_REDACT_AWK_LIB$1" && printf '.')"
  _rc=$?
  if [ "$_rc" -ne 0 ]; then return "$_rc"; fi
  case "$_out" in *.) ;; *) return 70 ;; esac
  printf '%s' "${_out%.}"
}

console_redact_text()   { _console_awk "$_CONSOLE_REDACT_AWK_TEXT"; }
console_screen_filter() { _console_awk "$_CONSOLE_REDACT_AWK_SCREEN"; }

console_screen_sha() {
  local _h
  if command -v openssl >/dev/null 2>&1; then _h="$(openssl dgst -sha256 -r 2>/dev/null)" || return 1   # openssl 우선(shasum 은 perl 이라 호출당 5배쯤 든다)
  elif command -v shasum >/dev/null 2>&1; then _h="$(shasum -a 256 2>/dev/null)" || return 1
  elif command -v sha256sum >/dev/null 2>&1; then _h="$(sha256sum 2>/dev/null)" || return 1
  else return 1
  fi
  _h="${_h%% *}"
  case "$_h" in ''|*[!0-9a-f]*) return 1 ;; esac
  [ "${#_h}" -eq 64 ] || return 1
  printf '%s\n' "$_h"
}

console_clean_prompt() {
  local _out _code _nl='
'
  _out="$(_console_awk "$_CONSOLE_PROMPT_AWK")" || return 4
  _code="${_out%%"$_nl"*}"
  case "$_code" in 0) ;; 1|2|3) return "$_code" ;; *) return 4 ;; esac
  _out="${_out#*"$_nl"}"
  [ -n "$_out" ] || return 1
  printf '%s\n' "$_out"
}
