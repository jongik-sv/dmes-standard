#!/usr/bin/env bash
# junit-count.sh 시험 — node 로 옮긴 새 판(scripts/junit-count.sh + junit-count.mjs)이 python 원본(tests/golden/legacy/junit-count.legacy.sh)과
# 같은 입력에서 stdout·stderr·종료 코드·--failed-file 결과까지 한 글자도 다르지 않은지 본다(골든 비교).
#
# 사용법: bash tests/junit-count.sh        (node 필요. python 이 있으면 원본과 직접 비교, 없으면 그 부분만 건너뛴다)
#         JUNIT_MAKE_EXPECTED=1 bash tests/junit-count.sh   기대값 파일(tests/golden/expected/junit-count.expected)을 python 원본으로 다시 만든다
#
# 비교는 두 겹이다.
#  (1) 새 판 == 미리 계산해 둔 기대값 파일  — python 이 없는 PC(윈도우)에서도 돈다. 기대값은 python 원본으로 만들었다.
#  (2) 새 판 == python 원본(같은 임시 폴더·같은 인자로 실행) — python 이 있을 때만.
# 모드 strict 는 rc·stdout·stderr·실패 파일을 모두, loose 는 rc·stdout 만 본다(python 이 traceback 으로 죽는 자리처럼 stderr 문구가
# 임시 경로를 품는 경우). 임시 폴더는 mktemp -d 로 만들고 끝에 이 시험이 만든 것만 지운다.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
NEW="$here/../scripts/junit-count.sh"
LEG="$here/golden/legacy/junit-count.legacy.sh"
EXP="$here/golden/expected/junit-count.expected"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/junit-count-test.XXXXXX")" && tmp="$(cd "$tmp" && pwd -P)"
trap 'rm -rf "$tmp"' EXIT
fail=0; pass=0; skipped=0
chk() { if [ "$1" = ok ]; then pass=$((pass+1)); echo "ok   $2"; else fail=$((fail+1)); echo "FAIL $2${3:+ — $3}"; fi; }
eq() { if [ "$2" = "$3" ]; then chk ok "$1"; else chk fail "$1" "기대 [$3] 실제 [$2]"; fi; }

command -v node >/dev/null 2>&1 || { echo "node 가 필요하다" >&2; exit 2; }

HAVE_PY=0
for cand in python3 python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c 'import xml.etree.ElementTree' >/dev/null 2>&1; then HAVE_PY=1; break; fi
done
[ "${DMES_NO_PYTHON:-}" = 1 ] && HAVE_PY=0   # python 이 없는 PC 를 흉내낸다(다른 시험과 같은 환경 변수)
MAKE="${JUNIT_MAKE_EXPECTED:-0}"
if [ "$MAKE" = 1 ] && [ "$HAVE_PY" = 0 ]; then echo "기대값을 만들려면 python 이 필요하다" >&2; exit 2; fi

mkdir -p "$tmp/fx" "$tmp/res" "$tmp/exp" "$tmp/out"
: > "$tmp/expected.new"
# 기대값 파일을 케이스별 조각으로 나눈다
if [ -f "$EXP" ] && [ "$MAKE" != 1 ]; then
  awk -v d="$tmp/exp" '/^=== /{f=d "/" substr($0,5)} f!=""{print > f}' "$EXP"
fi

w() { mkdir -p "$(dirname "$1")"; cat > "$1"; }

# ---- 케이스 실행 도구
CUR=""
begin() { CUR="$1"; mkdir -p "$tmp/fx/$1"; cd "$tmp/fx/$1" || exit 2; }

# cap <impl> <mode> <인자…> — 같은 폴더에서 한 판을 돌려 조각 파일을 만든다. @F 는 판마다 다른 실패 파일 경로로 바뀐다.
cap() {
  impl="$1"; mode="$2"; shift 2
  script="$NEW"; [ "$impl" = legacy ] && script="$LEG"
  ff="$tmp/out/$CUR.$impl.failed"
  if [ "${PREFILL:-0}" = 1 ]; then echo "old content that must be replaced" > "$ff"; else rm -f "$ff"; fi
  cargs=()
  for a in "$@"; do
    if [ "$a" = @F ]; then a="$ff"; fi
    cargs+=("$a")
  done
  sh "$script" ${cargs[@]+"${cargs[@]}"} > "$tmp/res/$CUR.$impl.out" 2> "$tmp/res/$CUR.$impl.err"
  rc=$?
  {
    echo "=== $CUR"
    echo "rc=$rc"
    echo "--- stdout"
    cat "$tmp/res/$CUR.$impl.out"
    if [ "$mode" = strict ]; then
      echo "--- stderr"
      cat "$tmp/res/$CUR.$impl.err"
      echo "--- failed"
      if [ -e "$ff" ]; then cat "$ff"; else echo "(none)"; fi
    fi
  } | sed "s|$tmp|<T>|g" > "$tmp/res/$CUR.$impl.blk"
}

docase() { # docase <strict|loose> <인자…>  (현재 폴더가 픽스처)
  mode="$1"; shift
  cap new "$mode" "$@"
  if [ "$MAKE" = 1 ]; then
    cap legacy "$mode" "$@"
    cat "$tmp/res/$CUR.legacy.blk" >> "$tmp/expected.new"
    return
  fi
  if [ -f "$tmp/exp/$CUR" ]; then
    if cmp -s "$tmp/res/$CUR.new.blk" "$tmp/exp/$CUR"; then chk ok "$CUR: 새 판 == 기대값"; else
      chk fail "$CUR: 새 판 == 기대값" "$(diff "$tmp/exp/$CUR" "$tmp/res/$CUR.new.blk" | head -8 | tr '\n' '|')"; fi
  else
    chk fail "$CUR: 기대값 조각이 있다" "$EXP 에 === $CUR 가 없다(JUNIT_MAKE_EXPECTED=1 로 다시 만든다)"
  fi
  if [ "$HAVE_PY" = 1 ]; then
    cap legacy "$mode" "$@"
    if cmp -s "$tmp/res/$CUR.new.blk" "$tmp/res/$CUR.legacy.blk"; then chk ok "$CUR: 새 판 == python 원본"; else
      chk fail "$CUR: 새 판 == python 원본" "$(diff "$tmp/res/$CUR.legacy.blk" "$tmp/res/$CUR.new.blk" | head -8 | tr '\n' '|')"; fi
  else
    skipped=$((skipped+1))
  fi
}

# ---- 픽스처 조각
JU_BASIC='<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="a" tests="3" failures="1" errors="0" skipped="1">
  <testcase classname="p.A" name="ok"/>
  <testcase classname="p.A" name="bad"><failure message="x">trace</failure></testcase>
  <testcase classname="p.A" name="skip"><skipped/></testcase>
</testsuite>
'
JU_OK='<testsuite tests="2" failures="0" errors="0" skipped="0"><testcase classname="q.B" name="one"/><testcase classname="q.B" name="two"/></testsuite>
'
old() { touch -t 202001010000 "$@"; }
new() { touch -t 202201010000 "$@"; }

# ============================================================ 기본 구조
begin gradle_basic
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-p.A.xml
docase strict

begin maven_basic
printf '%s' "$JU_BASIC" | w target/surefire-reports/TEST-p.A.xml
printf '%s' "$JU_OK" | w target/failsafe-reports/TEST-q.B.xml
printf '%s' "$JU_OK" | w target/surefire-reports/TEST-q.B.xml
printf '%s' "$JU_OK" | w target/other-reports/TEST-no.xml
printf '%s' "$JU_OK" | w target/surefire-reports/not-test.xml
docase strict --failed-file @F

begin multi_module_all
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/integrationTest/TEST-q.B.xml
printf '%s' "$JU_OK" | w mod2/target/surefire-reports/TEST-q.B.xml
printf '%s' "$JU_OK" | w mod3/build/test-results/TEST-too-shallow.xml
printf '%s' "$JU_OK" | w mod3/build/test-results/a/b/TEST-too-deep.xml
docase strict

begin multi_module_one
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/integrationTest/TEST-q.B.xml
docase strict mod2

begin multi_module_two_folders
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-q.B.xml
printf '%s' "$JU_OK" | w mod3/build/test-results/test/TEST-r.xml
docase strict mod1 mod2
begin multi_module_dashdash
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-q.B.xml
docase strict --failed-file @F -- ./mod1 mod2
begin multi_module_absolute
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-q.B.xml
docase strict "$PWD/mod1" "$PWD/mod2/"
begin multi_module_duplicate_roots
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-p.A.xml
docase strict mod1 mod1 .

begin nested_modules
printf '%s' "$JU_BASIC" | w a/build/test-results/test/TEST-a.xml
printf '%s' "$JU_OK" | w a/b/build/test-results/test/TEST-b.xml
printf '%s' "$JU_OK" | w a/b/c/target/surefire-reports/TEST-c.xml
printf '%s' "$JU_OK" | w a/b/c/d/e/f/build/test-results/test/TEST-f.xml
docase strict --failed-file @F

# ============================================================ 제외 폴더
begin excluded_dirs
printf '%s' "$JU_OK" | w build/test-results/test/TEST-good.xml
printf '%s' "$JU_BASIC" | w node_modules/x/build/test-results/test/TEST-n.xml
printf '%s' "$JU_BASIC" | w .git/x/build/test-results/test/TEST-g.xml
printf '%s' "$JU_BASIC" | w .gradle/x/build/test-results/test/TEST-gr.xml
printf '%s' "$JU_BASIC" | w .claude/worktrees/w1/build/test-results/test/TEST-w.xml
printf '%s' "$JU_BASIC" | w sub/.claude/worktrees/w2/target/surefire-reports/TEST-w2.xml
printf '%s' "$JU_BASIC" | w sub/node_modules/y/target/surefire-reports/TEST-n2.xml
printf '%s' "$JU_OK" | w .claude/other/build/test-results/test/TEST-claude-other.xml
docase strict --failed-file @F

# ============================================================ 없음·전부 깨짐
begin no_xml
mkdir -p build/test-results/test target/surefire-reports
printf 'x' > build/test-results/test/not-test.txt
docase strict
begin no_xml_folders
mkdir -p mod1 mod2
docase strict mod1 mod2
begin no_xml_missing_folder
docase loose nosuch-dir
begin all_broken
printf '<testsuite tests="1"' | w build/test-results/test/TEST-a.xml
printf 'not xml at all' | w build/test-results/test/TEST-b.xml
: | w build/test-results/test/TEST-c.xml
docase strict --failed-file @F

# ============================================================ 깨진 XML 종류
begin broken_mixed
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-good.xml
printf '<testsuite tests="9"><testcase name="a"></testsuite>' | w build/test-results/test/TEST-mismatch.xml
printf '<testsuite tests="9" name="x/>' | w build/test-results/test/TEST-unclosed-attr.xml
printf '<testsuite tests="9"/><testsuite tests="9"/>' | w build/test-results/test/TEST-two-roots.xml
printf '<testsuite tests="9"/>trailing' | w build/test-results/test/TEST-trailing-text.xml
printf '<!-- only a comment -->' | w build/test-results/test/TEST-comment-only.xml
printf '   \n' | w build/test-results/test/TEST-blank.xml
: | w build/test-results/test/TEST-empty.xml
printf '<testsuite tests="9" tests="9"/>' | w build/test-results/test/TEST-dup-attr.xml
printf '<testsuite tests=9/>' | w build/test-results/test/TEST-unquoted.xml
printf '<testsuite tests="9"><testcase name="&nbsp;"/></testsuite>' | w build/test-results/test/TEST-undef-entity.xml
printf '<testsuite tests="9"><testcase name="a & b"/></testsuite>' | w build/test-results/test/TEST-bare-amp.xml
printf '<testsuite tests="9">\001</testsuite>' | w build/test-results/test/TEST-ctrl-char.xml
printf '<testsuite tests="9">]]></testsuite>' | w build/test-results/test/TEST-cdata-end.xml
printf '<testsuite tests="9"><!-- a -- b --></testsuite>' | w build/test-results/test/TEST-comment-dashes.xml
printf '<testsuite tests="9"><![CDATA[x</testsuite>' | w build/test-results/test/TEST-cdata-open.xml
printf '<testsuite tests="9"><testcase name="&#0;"/></testsuite>' | w build/test-results/test/TEST-charref-nul.xml
printf '<testsuite tests="9"><a:b/></testsuite>' | w build/test-results/test/TEST-unbound-prefix.xml
printf '<?xml version="1.0"?><?xml version="1.0"?><testsuite tests="9"/>' | w build/test-results/test/TEST-two-decls.xml
printf ' <?xml version="1.0"?><testsuite tests="9"/>' | w build/test-results/test/TEST-space-before-decl.xml
printf '<1testsuite tests="9"/>' | w build/test-results/test/TEST-bad-name.xml
printf '<testsuite tests="9"><</testsuite>' | w build/test-results/test/TEST-lt-text.xml
printf '<testsuite tests="9" name="<"/>' | w build/test-results/test/TEST-lt-attr.xml
printf '<testsuite tests="9" ><testcase /></ testsuite>' | w build/test-results/test/TEST-endtag-space.xml
printf '\377\376\000\000' | w build/test-results/test/TEST-binary.xml
docase strict --failed-file @F

begin non_junit_roots
printf '<foo tests="9"/>' | w build/test-results/test/TEST-foo.xml
printf '<testsuites/>' | w build/test-results/test/TEST-empty-suites.xml
printf '<testsuites tests="9"><other tests="9"/></testsuites>' | w build/test-results/test/TEST-other-child.xml
printf '<Testsuite tests="9"/>' | w build/test-results/test/TEST-case.xml
printf '<testsuite xmlns="http://x" tests="9"/>' | w build/test-results/test/TEST-ns-default.xml
printf '<n:testsuite xmlns:n="http://x" tests="9"/>' | w build/test-results/test/TEST-ns-prefix.xml
printf '<testsuite xmlns:n="http://x" n:tests="9" tests="2"/>' | w build/test-results/test/TEST-ns-attr.xml
printf '<testsuite xmlns="" tests="4"/>' | w build/test-results/test/TEST-ns-empty.xml
docase strict --failed-file @F

# ============================================================ 합산 규칙
begin testsuites_wrapper
w build/test-results/test/TEST-wrap.xml <<'EOF'
<?xml version="1.0"?>
<testsuites name="all" tests="999" failures="999">
  <testsuite name="s1" tests="2" failures="1" errors="0" skipped="0">
    <testcase classname="w.A" name="a"/>
    <testcase classname="w.A" name="b"><failure/></testcase>
    <testsuite name="nested" tests="50" failures="50"><testcase classname="n.N" name="n"><failure/></testcase></testsuite>
  </testsuite>
  <testsuite name="s2" tests="3" failures="0" errors="2" skipped="1">
    <testcase classname="w.B" name="c"><error message="e"/></testcase>
    <testcase classname="w.B" name="d"><error/></testcase>
    <testcase classname="w.B" name="e"><skipped/></testcase>
  </testsuite>
  <wrapper><testsuite tests="77"><testcase classname="x.X" name="x"><failure/></testcase></testsuite></wrapper>
</testsuites>
EOF
docase strict --failed-file @F

begin attributes_numeric
w build/test-results/test/TEST-attrs.xml <<'EOF'
<testsuites>
  <testsuite/>
  <testsuite tests="abc" failures="" errors=" " skipped="x1"/>
  <testsuite tests=" 5 " failures="+2" errors="3." skipped=".5"/>
  <testsuite tests="1e2" failures="2.7" errors="-3" skipped="1_0"/>
  <testsuite tests="nan" failures="-nan" errors="0x10" skipped="1 2"/>
  <testsuite tests="&#49;0" failures="&#x32;" errors="1&#48;" skipped="٣"/>
  <testsuite tests="12345678901234567890123" failures="99999999999999999999" errors="1e30" skipped="-1e30"/>
  <testsuite tests="１２" failures="５" errors="-0" skipped="0.0"/>
</testsuites>
EOF
docase strict

begin attribute_inf_crash
printf '<testsuite tests="inf"/>' | w build/test-results/test/TEST-inf.xml
printf '%s' "$JU_OK" | w build/test-results/test/TEST-ok.xml
docase loose
begin attribute_inf_in_broken_file
printf '<testsuite tests="inf"><testcase></testsuite>' | w build/test-results/test/TEST-inf-broken.xml
printf '%s' "$JU_OK" | w build/test-results/test/TEST-ok.xml
docase strict
begin attribute_big_exponent
printf '<testsuite tests="1e999" failures="5"/>' | w build/test-results/test/TEST-big.xml
docase loose

begin failed_names
w build/test-results/test/TEST-f1.xml <<'EOF'
<testsuite tests="9">
  <testcase classname="b.Z" name="zed"><failure/></testcase>
  <testcase classname="a.A" name="alpha"><error/></testcase>
  <testcase classname="a.A" name="alpha"><failure/><error/></testcase>
  <testcase name="no-classname"><failure/></testcase>
  <testcase classname="no.Name"><failure/></testcase>
  <testcase><failure/></testcase>
  <testcase classname="p.Ok" name="fine"/>
  <testcase classname="p.Skip" name="s"><skipped/></testcase>
  <testcase classname="p.Rerun" name="r"><rerunFailure><failure/></rerunFailure></testcase>
  <testcase classname="p.Sys" name="sys"><system-out>failure error</system-out></testcase>
  <testcase classname="p.Ns" name="ns" xmlns:x="u"><x:failure/></testcase>
  <other><testcase classname="p.Other" name="o"><failure/></testcase></other>
</testsuite>
EOF
w target/surefire-reports/TEST-f2.xml <<'EOF'
<testsuite tests="1"><testcase classname="b.Z" name="zed"><failure/></testcase><testcase classname="a.A" name="alpha"><failure/></testcase></testsuite>
EOF
docase strict --failed-file @F

begin failed_none
printf '%s' "$JU_OK" | w build/test-results/test/TEST-ok.xml
docase strict --failed-file @F

begin failed_korean_order
w build/test-results/test/TEST-kr.xml <<'EOF'
<testsuite tests="9">
  <testcase classname="com.예제" name="한글 테스트"><failure/></testcase>
  <testcase classname="com.예제" name="가나다"><failure/></testcase>
  <testcase classname="com.Example" name="ascii"><failure/></testcase>
  <testcase classname="z" name="ｚ-fullwidth"><failure/></testcase>
  <testcase classname="z" name="😀-astral"><failure/></testcase>
  <testcase classname="z" name="é-latin"><failure/></testcase>
  <testcase classname="z" name="�-fffd"><failure/></testcase>
  <testcase classname="z" name="-e000"><failure/></testcase>
  <testcase classname="z" name="𐀀-10000"><failure/></testcase>
  <testcase classname="z" name="A"><failure/></testcase>
  <testcase classname="z" name="a"><failure/></testcase>
  <testcase classname="z" name="_"><failure/></testcase>
</testsuite>
EOF
docase strict --failed-file @F

begin entities_and_cdata
w build/test-results/test/TEST-ent.xml <<'EOF'
<testsuite tests="3">
  <testcase classname="e.E" name="lt &lt; gt &gt; amp &amp; q &quot; a &apos; &#65;&#x42;&#x1F600;"><failure><![CDATA[<not-a-tag> & ]] ]]></failure></testcase>
  <testcase classname="e.E" name="tab&#9;nl&#10;cr&#13;"><failure/></testcase>
  <testcase classname="e.E" name="lit-nl-in-attr
second	tab"><error/></testcase>
  <!-- a comment <testcase classname="c" name="in-comment"><failure/></testcase> -->
  <?pi <testcase classname="c" name="in-pi"><failure/></testcase> ?>
  <testcase classname="e.E" name="single-quoted" extra='x"y'><failure/></testcase>
</testsuite>
EOF
docase strict --failed-file @F

begin attr_whitespace_crlf
printf '<testsuite tests="1">\r\n<testcase classname="c.C" name="line1\r\nline2"><failure/></testcase>\r\n<testcase classname="c.C"\r\n  name="crlf-attr"><error/></testcase>\r\n</testsuite>\r\n' | w build/test-results/test/TEST-crlf.xml
printf '<testsuite tests="1">\r<testcase classname="c.C" name="lone-cr"><failure/></testcase>\r</testsuite>\r' | w build/test-results/test/TEST-cr.xml
docase strict --failed-file @F

begin bom_and_encodings
printf '\357\273\277<?xml version="1.0" encoding="UTF-8"?>\n<testsuite tests="2" failures="1"><testcase classname="bom.B" name="x"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-bom.xml
printf '<?xml version="1.0" encoding="ISO-8859-1"?>\n<testsuite tests="1"><testcase classname="l.L" name="caf\351"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-latin1.xml
printf '<?xml version="1.0" encoding="US-ASCII"?>\n<testsuite tests="1"><testcase classname="a.A" name="caf\351"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-ascii-bad.xml
printf '<?xml version="1.0" encoding="UTF-8"?>\n<testsuite tests="1"><testcase classname="u.U" name="caf\351"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-utf8-bad.xml
printf '<?xml version="1.0" encoding="windows-1252"?>\n<testsuite tests="1"><testcase classname="w.W" name="euro\200"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-cp1252.xml
printf '<?xml version="1.0" encoding="UTF-16"?>\n<testsuite tests="1"><testcase classname="x.X" name="no-utf16-bytes"><failure/></testcase></testsuite>\n' | w build/test-results/test/TEST-utf16-decl-8bit.xml
node -e "process.stdout.write(Buffer.from('﻿<?xml version=\"1.0\" encoding=\"UTF-16\"?><testsuite tests=\"4\" failures=\"1\"><testcase classname=\"u16.A\" name=\"한글\"><failure/></testcase></testsuite>','utf16le'))" | w build/test-results/test/TEST-utf16le-bom.xml
node -e "process.stdout.write(Buffer.from('<testsuite tests=\"5\"><testcase classname=\"u16.B\" name=\"nobom\"><error/></testcase></testsuite>','utf16le'))" | w build/test-results/test/TEST-utf16le-nobom.xml
node -e "const b=Buffer.from('﻿<testsuite tests=\"6\"><testcase classname=\"u16.C\" name=\"be\"><failure/></testcase></testsuite>','utf16le'); process.stdout.write(b.swap16())" | w build/test-results/test/TEST-utf16be-bom.xml
printf '<?xml version="1.0" encoding="UTF-16"?>\n<testsuite tests="1"/>' | w build/test-results/test/TEST-utf16-decl-no-bom.xml
docase strict --failed-file @F

begin doctype_and_entities
w build/test-results/test/TEST-dtd1.xml <<'EOF'
<?xml version="1.0"?>
<!DOCTYPE testsuite [
  <!ELEMENT testsuite ANY>
  <!ATTLIST testsuite tests CDATA "7" failures NMTOKEN " 2 ">
  <!ENTITY who "t&#101;st">
  <!ENTITY twice "&who;&who;">
]>
<testsuite name="&twice;"><testcase classname="d.D" name="&who; &twice;"><failure/></testcase></testsuite>
EOF
w build/test-results/test/TEST-dtd2.xml <<'EOF'
<!DOCTYPE testsuite SYSTEM "junit.dtd">
<testsuite tests="3" name="&undefined;"><testcase classname="d.D" name="ext"><failure/></testcase></testsuite>
EOF
w build/test-results/test/TEST-dtd3.xml <<'EOF'
<!DOCTYPE testsuite SYSTEM "junit.dtd">
<testsuite tests="3"><testcase classname="d.D" name="&undefined;"><failure/></testcase></testsuite>
EOF
w build/test-results/test/TEST-dtd4.xml <<'EOF'
<!DOCTYPE testsuite [<!ENTITY tc "<testcase classname='ent.E' name='from-entity'><failure/></testcase>">]>
<testsuite tests="1">&tc;</testsuite>
EOF
w build/test-results/test/TEST-dtd5.xml <<'EOF'
<!DOCTYPE testsuite [<!ENTITY loop "&loop;">]>
<testsuite tests="1">&loop;</testsuite>
EOF
w build/test-results/test/TEST-dtd6.xml <<'EOF'
<!doctype testsuite><testsuite tests="1"/>
EOF
w build/test-results/test/TEST-dtd7.xml <<'EOF'
<!DOCTYPE testsuite [<!ELEMENT testsuite (a|b,c)>]><testsuite tests="1"/>
EOF
w build/test-results/test/TEST-dtd8.xml <<'EOF'
<!DOCTYPE testsuite [<!ENTITY % pe "x"> %pe; <!ENTITY late "v">]><testsuite tests="2" name="&late;"/>
EOF
docase strict --failed-file @F

begin namespaces_misc
w build/test-results/test/TEST-ns1.xml <<'EOF'
<testsuite xmlns:p="urn:p" tests="2"><testcase p:name="ignored" name="plain" classname="n.N"><failure/></testcase><p:testcase classname="x" name="y"><failure/></p:testcase></testsuite>
EOF
w build/test-results/test/TEST-ns2.xml <<'EOF'
<testsuite tests="1" xmlns:xml="http://www.w3.org/XML/1998/namespace" xml:lang="en"><testcase classname="n.X" name="xml-prefix"><failure/></testcase></testsuite>
EOF
w build/test-results/test/TEST-ns3.xml <<'EOF'
<testsuite tests="1" xmlns:p="urn:a" xmlns:q="urn:a" p:x="1" q:x="2"/>
EOF
w build/test-results/test/TEST-ns4.xml <<'EOF'
<testsuite tests="1" xmlns:xml="urn:wrong"/>
EOF
docase strict --failed-file @F

# ============================================================ --since
begin since_epoch
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-old.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-new.xml
printf '%s' "$JU_OK" | w mod3/build/test-results/test/TEST-new2.xml
old mod1/build/test-results/test/TEST-old.xml
new mod2/build/test-results/test/TEST-new.xml mod3/build/test-results/test/TEST-new2.xml
docase strict --since 1609459200 --failed-file @F
begin since_epoch_all_stale
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-old.xml
old build/test-results/test/TEST-old.xml
docase strict --since 1609459200 --failed-file @F
begin since_zero
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-a.xml
docase strict --since 0
begin since_future
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-a.xml
docase strict --since 99999999999
begin since_file
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-old.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-new.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-same.xml
printf 'ref' > ref.marker
old mod1/build/test-results/test/TEST-old.xml
new mod2/build/test-results/test/TEST-new.xml ref.marker
touch -r ref.marker mod2/build/test-results/test/TEST-same.xml
docase strict --since ref.marker
begin since_file_in_dir_arg
printf '%s' "$JU_BASIC" | w mod1/build/test-results/test/TEST-old.xml
printf '%s' "$JU_OK" | w mod2/build/test-results/test/TEST-new.xml
old mod1/build/test-results/test/TEST-old.xml
new mod2/build/test-results/test/TEST-new.xml
docase strict --since mod2/build/test-results/test/TEST-new.xml mod1 mod2
begin since_invalid_missing_file
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
docase strict --since no-such-file.marker
begin since_invalid_text
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
docase strict --since abc
begin since_invalid_but_no_xml
docase strict --since no-such-file.marker
begin since_empty_value
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
old build/test-results/test/TEST-a.xml
docase strict --since ""
begin since_digits_unicode
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
old build/test-results/test/TEST-a.xml
docase strict --since ١٦٠٩٤٥٩٢٠٠
begin since_float_text
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
old build/test-results/test/TEST-a.xml
docase strict --since 1609459200.5
begin since_broken_and_stale
printf '<testsuite' | w build/test-results/test/TEST-old-broken.xml
printf '<testsuite' | w build/test-results/test/TEST-new-broken.xml
old build/test-results/test/TEST-old-broken.xml
new build/test-results/test/TEST-new-broken.xml
docase strict --since 1609459200

# ============================================================ 인자 오류·특이한 경로
begin usage_unknown_option
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
docase strict --bogus
begin usage_failed_file_missing_value
docase strict --failed-file
begin usage_since_missing_value
docase strict --since
begin usage_short_option
docase strict -x
begin usage_single_dash
docase strict -
begin args_after_dashdash_dash_word
printf '%s' "$JU_OK" | w ./-odd/build/test-results/test/TEST-a.xml
docase strict -- ./-odd

begin spaces_in_paths
printf '%s' "$JU_BASIC" | w "my mod/build/test-results/test set/TEST-my class.xml"
printf '%s' "$JU_OK" | w "other mod/target/surefire-reports/TEST-q.B.xml"
docase strict --failed-file @F "my mod" "other mod"
begin spaces_in_paths_default_root
printf '%s' "$JU_BASIC" | w "my mod/build/test-results/test set/TEST-my class.xml"
docase strict --failed-file @F
begin special_chars_in_paths
printf '%s' "$JU_BASIC" | w 'a$b/build/test-results/test/TEST-$x.xml'
printf '%s' "$JU_OK" | w "q'uote/build/test-results/test/TEST-q.xml"
printf '%s' "$JU_OK" | w '한글 모듈/build/test-results/test/TEST-한글.xml'
printf '%s' "$JU_BASIC" | w 'br[ack]et/build/test-results/test/TEST-b+.xml'
docase strict --failed-file @F

begin failed_file_unwritable
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-a.xml
docase loose --failed-file "$tmp/no-such-dir/x/failed.txt"

begin failed_file_overwritten
printf '%s' "$JU_BASIC" | w build/test-results/test/TEST-a.xml
PREFILL=1 docase strict --failed-file @F
begin failed_file_overwritten_empty
printf '%s' "$JU_OK" | w build/test-results/test/TEST-a.xml
PREFILL=1 docase strict --failed-file @F

# ============================================================ 큰 입력·정렬
begin large_file
awk 'BEGIN{n=20000; print "<testsuite tests=\"" n "\" failures=\"" n/10 "\" skipped=\"3\">"; for(i=0;i<n;i++){ if(i%10==0) printf "<testcase classname=\"c.C%d\" name=\"t%d &amp; x\"><failure message=\"m\">tr</failure></testcase>\n", i%7, i; else printf "<testcase classname=\"c.C%d\" name=\"t%d\"/>\n", i%7, i }; print "<system-out><![CDATA[" ; for(i=0;i<2000;i++) print "log line " i " <&> ]] x"; print "]]></system-out></testsuite>"}' | w build/test-results/test/TEST-big.xml
docase strict --failed-file @F
begin many_files
mk=0
while [ "$mk" -lt 60 ]; do
  printf '<testsuite tests="%d" failures="%d" errors="1" skipped="2"><testcase classname="m.M%d" name="t"><failure/></testcase></testsuite>' "$((mk+1))" "$((mk%3))" "$mk" | w "mod$((mk%7))/build/test-results/test$((mk%3))/TEST-m$mk.xml"
  mk=$((mk+1))
done
docase strict --failed-file @F

# ============================================================ 합계 줄 형식 직접 확인(기대값을 python 이 아니라 손으로 적는다)
cd "$tmp" || exit 2
mkdir -p hand/m1/build/test-results/test hand/m2/target/surefire-reports
printf '%s' "$JU_BASIC" > hand/m1/build/test-results/test/TEST-a.xml
printf '%s' "$JU_OK" > hand/m2/target/surefire-reports/TEST-b.xml
out="$(cd hand && sh "$NEW" --failed-file "$tmp/hand-failed.txt" 2>"$tmp/hand-err")"; rc=$?
eq "직접: 합계 줄" "$out" "JUNIT_SUMMARY tests=5 failures=1 errors=0 skipped=1 files=2"
eq "직접: rc 0" "$rc" 0
eq "직접: stderr 비어 있음" "$(wc -c < "$tmp/hand-err" | tr -d ' ')" 0
eq "직접: 실패 목록" "$(cat "$tmp/hand-failed.txt")" "p.A.bad"
out="$(cd hand && sh "$NEW" m1 2>/dev/null)"
eq "직접: 폴더 하나만" "$out" "JUNIT_SUMMARY tests=3 failures=1 errors=0 skipped=1 files=1"
mkdir -p hand-none
out="$(cd hand-none && sh "$NEW" 2>/dev/null)"; rc=$?
eq "직접: XML 없음은 NONE" "$out" "JUNIT_SUMMARY_NONE ."
eq "직접: XML 없음은 rc 1" "$rc" 1

# ============================================================ python 흔적·node 부재
body="$(grep -v '^[[:space:]]*#' "$NEW")"
case "$body" in *python*|*PYEOF*|*NOPY*) chk fail "junit-count.sh 본문에 python 이 없다" ;; *) chk ok "junit-count.sh 본문에 python 이 없다" ;; esac
if grep -q 'child_process' "$here/../scripts/junit-count.mjs"; then chk fail "junit-count.mjs 가 하위 프로세스를 부르지 않는다"; else chk ok "junit-count.mjs 가 하위 프로세스를 부르지 않는다"; fi

# python 흉내가 PATH 에 있어도 부르지 않는다
mkdir -p "$tmp/fakepy" "$tmp/hand-py"
for n in python python3; do printf '#!/bin/sh\ntouch "%s/called"\nexit 9\n' "$tmp" > "$tmp/fakepy/$n"; chmod +x "$tmp/fakepy/$n"; done
printf '%s' "$JU_OK" > "$tmp/hand-py/TEST-a.xml"
mkdir -p "$tmp/hand-py/build/test-results/test" && mv "$tmp/hand-py/TEST-a.xml" "$tmp/hand-py/build/test-results/test/"
out="$(cd "$tmp/hand-py" && PATH="$tmp/fakepy:$PATH" sh "$NEW" 2>/dev/null)"
eq "python 이 PATH 에 있어도 부르지 않는다" "$([ -e "$tmp/called" ] && echo called || echo none)" none
eq "그때도 합계가 나온다" "$out" "JUNIT_SUMMARY tests=2 failures=0 errors=0 skipped=0 files=1"

# node 가 없으면 NOPY 자리에서 JUNIT_SUMMARY_NONODE + exit 2 (XML 이 없어도 NONE 이 아니라 NONODE 가 먼저)
mkdir -p "$tmp/min"
for t in sh dirname mktemp find sort tr sed rm cat; do
  p="$(command -v "$t" 2>/dev/null)"; [ -n "$p" ] && ln -sf "$p" "$tmp/min/$t"
done
SHBIN="$(command -v sh)"
out="$(cd "$tmp/hand" && PATH="$tmp/min" "$SHBIN" "$NEW" 2>"$tmp/nonode-err")"; rc=$?
eq "node 없음: stdout" "$out" "JUNIT_SUMMARY_NONODE"
eq "node 없음: rc 2" "$rc" 2
eq "node 없음: stderr 비어 있음" "$(wc -c < "$tmp/nonode-err" | tr -d ' ')" 0
out="$(cd "$tmp/hand-none" && PATH="$tmp/min" "$SHBIN" "$NEW" 2>/dev/null)"; rc=$?
eq "node 없음: XML 이 없어도 NONODE 가 먼저" "$out" "JUNIT_SUMMARY_NONODE"
eq "node 없음: 그때도 rc 2" "$rc" 2

# 다른 폴더에서 불러도(절대 경로·상대 경로) 본체를 찾는다
out="$(cd "$tmp/hand" && sh "$NEW" "$tmp/hand/m1" 2>/dev/null)"
eq "다른 폴더에서 절대 경로로 호출" "$out" "JUNIT_SUMMARY tests=3 failures=1 errors=0 skipped=1 files=1"
out="$(cd "$here/../scripts" && sh ./junit-count.sh "$tmp/hand/m1" 2>/dev/null)"
eq "스크립트 폴더에서 상대 경로로 호출" "$out" "JUNIT_SUMMARY tests=3 failures=1 errors=0 skipped=1 files=1"

# 임시 파일이 남지 않는다(mktemp 두 개를 EXIT trap 이 지운다)
mkdir -p "$tmp/tmpd"
( cd "$tmp/hand" && TMPDIR="$tmp/tmpd" sh "$NEW" >/dev/null 2>&1 )
eq "임시 파일이 남지 않는다" "$(ls "$tmp/tmpd" | wc -l | tr -d ' ')" 0

# ============================================================ python 판과 일부러 달라진 곳(직접 못 박는다 — 골든 비교 대상이 아니다)
mkdir -p "$tmp/div/build/test-results/test"
cd "$tmp/div" || exit 2
printf '<?xml version="1.0" encoding="bogus"?><testsuite tests="5"/>' > build/test-results/test/TEST-bogus-enc.xml
printf '%s' "$JU_OK" > build/test-results/test/TEST-ok.xml
out="$(sh "$NEW" 2>"$tmp/div-err")"; rc=$?
eq "① 알 수 없는 인코딩: 합계(python 은 LookupError 로 죽었다)" "$out" "JUNIT_SUMMARY tests=2 failures=0 errors=0 skipped=0 files=1"
eq "① 알 수 없는 인코딩: rc 0" "$rc" 0
eq "① 알 수 없는 인코딩: stderr" "$(cat "$tmp/div-err")" "JUNIT_SKIP ./build/test-results/test/TEST-bogus-enc.xml"
out="$(sh "$NEW" --since '²' 2>"$tmp/div-err")"; rc=$?
eq "③ isdigit 이지만 float 가 아닌 --since: stdout 없음" "$out" ""
eq "③ rc 2" "$rc" 2
eq "③ stderr" "$(cat "$tmp/div-err")" "JUNIT_SINCE_INVALID ²"
printf '<testsuite tests="inf"/>' > build/test-results/test/TEST-bogus-enc.xml
out="$(sh "$NEW" 2>"$tmp/div-err")"; rc=$?
eq "⑤ 속성 inf: stdout 없음" "$out" ""
eq "⑤ 속성 inf: rc 1" "$rc" 1
case "$(cat "$tmp/div-err")" in OverflowError*) chk ok "⑤ 속성 inf: stderr 가 OverflowError 로 시작" ;; *) chk fail "⑤ 속성 inf: stderr" "$(cat "$tmp/div-err")" ;; esac
printf '<test\321suite tests="9"/>' > build/test-results/test/TEST-bogus-enc.xml
out="$(sh "$NEW" 2>"$tmp/div-err")"
eq "④ 이름 안의 깨진 UTF-8 바이트는 깨진 XML 로 본다" "$(cat "$tmp/div-err")" "JUNIT_SKIP ./build/test-results/test/TEST-bogus-enc.xml"
printf '<testsuite tests="1"><testcase classname="c" name="n"><failure/></testcase></testsuite>' > build/test-results/test/TEST-bogus-enc.xml
sh "$NEW" --failed-file "$tmp/div-failed" >/dev/null 2>&1
eq "⑥ --failed-file 은 LF 줄끝(CR 없음)" "$(od -An -c "$tmp/div-failed" | tr -d ' \n')" 'c.n\n'

# ============================================================ 윈도우 Git Bash 흉내: cygpath 가 있으면 읽기 경로를 따로 쓴다
# 가짜 cygpath(-m -f 목록) 가 vroot/ 를 realroot/ 로 바꿔 준다. 읽는 쪽은 realroot, 출력은 find 가 낸 vroot 그대로여야 한다.
mkdir -p "$tmp/cyg" "$tmp/cygfx"
cat > "$tmp/cyg/cygpath" <<'CYG'
#!/bin/sh
# 흉내: cygpath -m -f <목록파일>
[ "$1" = -m ] && [ "$2" = -f ] || exit 1
sed 's|^vroot/|realroot/|' "$3"
CYG
chmod +x "$tmp/cyg/cygpath"
cd "$tmp/cygfx" || exit 2
printf '<testsuite tests="1"/>' | w vroot/build/test-results/test/TEST-a.xml
printf '%s' "$JU_BASIC" | w realroot/build/test-results/test/TEST-a.xml
printf '<testsuite tests="1"/>' | w vroot/build/test-results/test/TEST-broken.xml
printf '<testsuite' | w realroot/build/test-results/test/TEST-broken.xml
printf '<testsuite tests="1"/>' | w vroot/build/test-results/test/TEST-old.xml
printf '%s' "$JU_OK" | w realroot/build/test-results/test/TEST-old.xml
old realroot/build/test-results/test/TEST-old.xml
new vroot/build/test-results/test/TEST-old.xml
out="$(PATH="$tmp/cyg:$PATH" sh "$NEW" --failed-file "$tmp/cyg-failed" vroot 2>"$tmp/cyg-err")"; rc=$?
eq "cygpath: 읽기는 변환 경로(합계가 realroot 내용)" "$out" "JUNIT_SUMMARY tests=5 failures=1 errors=0 skipped=1 files=2"
eq "cygpath: 출력 경로는 find 가 낸 그대로" "$(cat "$tmp/cyg-err")" "JUNIT_SKIP vroot/build/test-results/test/TEST-broken.xml"
eq "cygpath: rc 0" "$rc" 0
eq "cygpath: 실패 목록" "$(cat "$tmp/cyg-failed")" "p.A.bad"
out="$(PATH="$tmp/cyg:$PATH" sh "$NEW" --since 1609459200 vroot 2>"$tmp/cyg-err")"
eq "cygpath: --since 의 mtime 도 변환 경로로 잰다(realroot 의 old 가 오래됨)" "$out" "JUNIT_SUMMARY tests=3 failures=1 errors=0 skipped=1 files=1"
eq "cygpath: JUNIT_STALE 도 원래 경로로 출력" "$(grep '^JUNIT_STALE' "$tmp/cyg-err")" "JUNIT_STALE vroot/build/test-results/test/TEST-old.xml"
# cygpath 가 실패하면(목록 변환 불가) 원래 경로로 읽는다
printf '#!/bin/sh\nexit 3\n' > "$tmp/cyg/cygpath"
out="$(PATH="$tmp/cyg:$PATH" sh "$NEW" vroot 2>/dev/null)"
eq "cygpath 가 실패하면 원래 경로로 읽는다" "$out" "JUNIT_SUMMARY tests=3 failures=0 errors=0 skipped=0 files=3"
# 줄 수가 어긋난 읽기 목록은 무시한다(.mjs 직접 호출)
printf '%s\n%s\n' "vroot/build/test-results/test/TEST-a.xml" "vroot/build/test-results/test/TEST-old.xml" > "$tmp/list-a"
printf '%s\n' "realroot/build/test-results/test/TEST-a.xml" > "$tmp/list-b"
out="$(cd "$tmp/cygfx" && node "$here/../scripts/junit-count.mjs" "$tmp/list-a" "" "" "$tmp/list-b" 2>/dev/null)"
eq "읽기 목록의 줄 수가 다르면 무시한다" "$out" "JUNIT_SUMMARY tests=2 failures=0 errors=0 skipped=0 files=2"
printf '%s\n%s\n' "realroot/build/test-results/test/TEST-a.xml" "realroot/build/test-results/test/TEST-old.xml" > "$tmp/list-b"
out="$(cd "$tmp/cygfx" && node "$here/../scripts/junit-count.mjs" "$tmp/list-a" "" "" "$tmp/list-b" 2>/dev/null)"
eq "읽기 목록이 맞으면 그 경로를 읽는다" "$out" "JUNIT_SUMMARY tests=5 failures=1 errors=0 skipped=1 files=2"

# ---- 기대값 파일 쓰기
if [ "$MAKE" = 1 ]; then
  mkdir -p "$(dirname "$EXP")"
  cp "$tmp/expected.new" "$EXP"
  echo "기대값 파일을 썼다: $EXP ($(grep -c '^=== ' "$EXP") 케이스)"
  exit 0
fi

[ "$HAVE_PY" = 1 ] || echo "(python 이 없어 원본과의 직접 비교 ${skipped}건은 건너뛰었다 — 기대값 파일과의 비교는 했다)"
echo "통과 $pass · 실패 $fail"
[ "$fail" = 0 ]
