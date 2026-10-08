/**
 * 요청 순번 — 비동기 요청을 연달아 낼 때 가장 나중에 낸 요청의 응답만 쓰기 위한 작은 도구.
 * next() 로 번호표를 받아 요청을 보내고, 응답이 오면 isLatest(번호표) 가 참일 때만 화면에 반영한다.
 */
export interface Seq {
  next: () => number;
  isLatest: (ticket: number) => boolean;
}

export function createSeq(): Seq {
  let current = 0;
  return {
    next: () => ++current,
    isLatest: (ticket) => ticket === current,
  };
}
