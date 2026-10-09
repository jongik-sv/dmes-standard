// bash 판 스크립트가 grep·sed 에서 쓰는 `[[:space:]]` 의 node 판(W3-b 가 공용으로 쓴다).
// grep·sed 의 [[:space:]] 는 로케일을 따른다(macOS 에서 측정). C 로케일은 ASCII 공백(SP·TAB·LF·VT·FF·CR)뿐이고,
// UTF-8 로케일은 NBSP·U+1680·U+2000~200A·U+2028·U+2029·U+202F·U+205F·U+3000 도 공백이다(U+0085·U+180E·U+200B·U+FEFF 는 아니다).
// 로케일은 환경 변수(LC_ALL > LC_CTYPE > LANG)의 utf-8 표기로 가른다. 없는 로케일 이름이면 bash 는 C 처럼 동작하는데 node 판은 넓은 쪽으로 읽는다 —
// 공백이 더 넓으면 거부·보류가 늘 뿐 허용이 늘지 않는 쪽(안전한 쪽)이다.
const UNI_SPACE = '\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

export const utf8Locale = (env) => /utf-?8/i.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '');
/** 정규식 대괄호 안에 넣을 [[:space:]] 낱글자들(이스케이프된 글) */
export const spaceChars = (env) => ` \\t\\n\\v\\f\\r${utf8Locale(env) ? UNI_SPACE : ''}`;
/** `grep -q '[^[:space:]]'` — 공백이 아닌 글자가 하나라도 있는가 */
export const hasNonSpace = (env, text) => new RegExp(`[^${spaceChars(env)}]`).test(text);
