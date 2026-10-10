"use client";

/**
 * 공용 쿼리 분류(USRQ_CTG) LoV — 관리 화면 조회조건·상세·목록 칸과 사용자 화면 목록 묶음이 함께 쓴다.
 * 조회·보관 규칙은 widget-types/_query/use-code-options.ts 가 그룹 단위로 맡는다.
 */
import { useMemo } from "react";

import { codeTitles, fetchCodeOptions, useCodeOptions, type CodeOption } from "../../widget-types/_query/use-code-options";

export type UsrqCategoryOption = CodeOption;

export const USRQ_CATEGORY_GROUP = "USRQ_CTG";

export function fetchUsrqCategories(): Promise<UsrqCategoryOption[]> {
  return fetchCodeOptions(USRQ_CATEGORY_GROUP);
}

/** 분류 옵션과 코드→이름 변환. 첫 그림에는 빈 값, 조회가 끝나면 채워진다. */
export function useUsrqCategories() {
  const options = useCodeOptions(USRQ_CATEGORY_GROUP);
  const titles = useMemo(() => codeTitles(options), [options]);
  return { options, titles };
}
