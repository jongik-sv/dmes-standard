// 시험 전용: 윈도우에서 기대값 비교가 경로 구분자 때문에 깨지지 않게 하는 정규화.
// 스크립트는 윈도우에서 `\` 로 경로를 출력한다(python 판과 같음 — 그대로 둔다). 기대값 파일은 mac 에서 만들어 `/` 라서,
// 시험의 비교 단계에서만 win32 이면 `\` → `/` 로 맞춘다. 비교 양쪽(실제값·기대값)에 같은 함수를 쓰므로 정상 출력 안의 `\`
// (정규식 문구 등)가 있어도 두 쪽이 똑같이 바뀌어 어긋나지 않는다. win32 가 아니면 값을 그대로 돌려준다.
// `platform` 인자로 win32 분기를 mac 에서도 시험할 수 있다(norm.test.mjs).

/** 문자열·배열·객체 안의 모든 문자열 값에서 `\` 를 `/` 로 바꾼다(win32 일 때만). 키는 바꾸지 않는다. */
export function normSep(value, platform = process.platform) {
  if (platform !== 'win32') return value;
  const walk = (v) => {
    if (typeof v === 'string') return v.replace(/\\/g, '/');
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}
