/**
 * 메시지 줄의 부르는 세트(하위 세트 spec §10.4, 계획 Task 8) — 서버 문구에서 부르는 세트 ID 를 뽑아 메시지 아래 링크 단추로 보인다.
 * 문구는 서버가 정한다. 화면은 문구 안을 링크로 바꾸지 않고 ID 만 뽑는다. 순서대로, 중복 없이.
 *
 * 뽑는 서버 문구(Java 와 글자 대조):
 * - 거부 문구(`RuleSetRejections.detail` — `"<룰 ID>[<변수>] <코드> <문구>; …"`) 안
 *   - `CALLER_BROKEN 세트 P: …` · `CALLER_BROKEN 세트 P v1.001: …`(`SetCallerRecheck` — 부르는 행이 여럿이면 버전 꼬리표)
 *   - `CALLER_BROKEN 사용 중인 세트 P1, P2가 이 세트를 불러 폐기할 수 없다. …`(`RuleSetEditService.rejectIfCalled` — 폐기 거부)
 * - 경고 줄(저장·되살리기 응답 `checks` 의 message 한 줄씩, 코드 없이 온다)
 *   - `세트 P: …` · `세트 P v1.001: …`(저장의 CALLER_BROKEN 은 WARN 사본으로 온다 — `RuleSetEditService.callWarnings`)
 *   - `부르는 세트에 경고가 생겼다: P1, P2`(CALLER_WARN)
 *
 * 세트 ID 는 서버 `NamingRules.STD_PHYS_NAME`(`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`)을 따른다. 그래서 같은 머리의 다른 경고
 * (`세트 호출이 순환한다: …`·`세트 노드 s1에 …`)는 걸리지 않는다.
 */
const ID = "[A-Z][A-Z0-9_]*";
const IDS = `${ID}(?:, ${ID})*`;
/** 버전 꼬리표 — `VersionNumbers.label`("v" + 소수 셋째 자리). */
const VER = "(?: v\\d+\\.\\d+)?";

const BROKEN_IN_TEXT = new RegExp(`CALLER_BROKEN 세트 (${ID})${VER}: `, "g");
const DEPRECATE_IN_TEXT = new RegExp(`CALLER_BROKEN 사용 중인 세트 (${IDS})가 `, "g");
const BROKEN_LINE = new RegExp(`^세트 (${ID})${VER}: `);
const WARN_LINE = new RegExp(`^부르는 세트에 경고가 생겼다: (${IDS})$`);

/** 메시지 문구(text)와 경고 줄(lines)에서 부르는 세트 ID 를 순서대로(문구 먼저), 중복 없이 뽑는다. 없으면 빈 목록. */
export function callerSetIds(text: string, lines: readonly string[] = []): string[] {
  const out: string[] = [];
  const add = (ids: string) => {
    for (const id of ids.split(",")) {
      const t = id.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  };
  // 거부 문구는 검사 여럿이 "; " 로 이어진다 — 두 꼴이 섞여도 나온 자리 순서로 뽑는다.
  const hits: Array<{ at: number; ids: string }> = [];
  for (const m of text.matchAll(BROKEN_IN_TEXT)) hits.push({ at: m.index ?? 0, ids: m[1] });
  for (const m of text.matchAll(DEPRECATE_IN_TEXT)) hits.push({ at: m.index ?? 0, ids: m[1] });
  hits.sort((a, b) => a.at - b.at).forEach((h) => add(h.ids));
  for (const l of lines) {
    const m = l.match(WARN_LINE) ?? l.match(BROKEN_LINE);
    if (m) add(m[1]);
  }
  return out;
}
