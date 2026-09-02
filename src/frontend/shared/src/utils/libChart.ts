/**
 * 차트 관련 유틸리티 함수 모음
 * RMate Chart H5를 사용한 차트 생성 및 관리 기능을 제공합니다.
 */

interface RMateWorkbook {
  rMateChartH5License: string;
}

/**
 * RMate Chart H5 라이센스 정보 조회
 */
export function getRMateChartH5License(wb: RMateWorkbook): string {
  return wb.rMateChartH5License;
}
