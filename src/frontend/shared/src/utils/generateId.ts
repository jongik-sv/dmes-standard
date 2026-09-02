/**
 * @file generateId.ts
 * @description 접근성(a11y) 속성 연결을 위한 고유 ID 생성 유틸리티
 *
 * React 컴포넌트에서 input-label, input-error 등의 aria 속성 연결에 사용합니다.
 *
 * @example
 * import { generateId } from '@dk-oasis/shared/utils';
 * const id = generateId('input'); // 'input-1'
 */

let idCounter = 0;

/**
 * 접근성 속성 연결을 위한 고유 ID를 생성합니다.
 *
 * @param prefix - ID 접두사 (기본값: 'cm')
 * @returns 고유 ID 문자열 (예: 'cm-1', 'input-2')
 */
export function generateId(prefix: string = "cm"): string {
  return `${prefix}-${++idCounter}`;
}
