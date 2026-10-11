/**
 * 사전에 없는 단어 표시(2차 §7.3). 서버 ColumnNameComposer 는 물리명에서 논리명을 만들 때 사전에 없는 토막을 `***` 로 둔다.
 * 화면은 그 자리에 물리 토막을 넣어 보여 주고, 저장 값과 「사전 없음」 위반 판정은 바꾸지 않는다.
 */
export const PLACEHOLDER = "***";

export interface PlaceholderName {
  /** `***` 자리에 물리 토막을 넣은 이름(표시용). 자리를 맞추지 못하면 reconstructed 와 같다. */
  display: string;
  /** 저장된 논리명 그대로(`***` 포함). */
  reconstructed: string;
  /** display 를 공백으로 나눈 단어 중 바꿔 넣은 단어의 자리 번호(0부터). */
  unknownWords: number[];
  /** 논리명에 `***` 가 있는데 단어 수와 물리명 토막 수가 달라 자리를 맞추지 못했다. 이때 툴팁에 물리명 전체를 보인다. */
  mismatch: boolean;
}

export function placeholderName(logical: string | null | undefined, phys: string | null | undefined): PlaceholderName {
  const reconstructed = logical ?? "";
  if (!reconstructed.includes(PLACEHOLDER)) return { display: reconstructed, reconstructed, unknownWords: [], mismatch: false };
  const words = reconstructed.split(/\s+/).filter((w) => w !== "");
  const tokens = (phys ?? "").split("_").filter((t) => t !== "");
  if (words.length === 0 || words.length !== tokens.length) return { display: reconstructed, reconstructed, unknownWords: [], mismatch: true };
  const unknownWords: number[] = [];
  const shown = words.map((w, i) => {
    if (!w.includes(PLACEHOLDER)) return w;
    unknownWords.push(i);
    return w.split(PLACEHOLDER).join(tokens[i]);
  });
  return { display: shown.join(" "), reconstructed, unknownWords, mismatch: false };
}
