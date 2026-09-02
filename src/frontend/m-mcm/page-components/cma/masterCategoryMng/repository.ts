/**
 * 카테고리 관리 (masterCategoryMng) — Repository.
 *
 * BFF endpoints (OASIS — docs/guide/FrontEnd/standard-v2/frontend-standard/01-rules-decisions-files.md §2-2-1-A):
 *  - POST /api/mcm/oasis/masterCategoryMng/search → 그리드 + 전체 키 (list + allList)
 *  - POST /api/mcm/oasis/masterCategoryMng/save   → 일괄 저장 (rowStatus C/U/D) + 후속 재조회
 *
 * BE: com.dongkuk.dmes.mcm.cma.masterCategoryMng.service.MasterCategoryMngService (mcm-core)
 *  (BPMN: mcm/api/src/main/resources/services/cma/masterCategoryMng.bpmn).
 *
 * 응답 포맷 (cactus CactusResponseConverter):
 *  - List 값 → grids.{key}.rows
 *  - 단일 값 → data.{key}
 *
 * BPMN saveTask `output="result"` → service 가 반환한 Map 이 process variable `result` 로 저장 →
 * Map 의 각 entry (cnt_merge / list / allList) 가 ServiceResult.results() 에 풀려 들어옴 →
 * CactusResponseConverter 가 List 는 grids, 단일값(cnt_merge) 은 data 로 분류.
 *
 * 그래서 search/save 응답 모두 grids.list.rows + grids.allList.rows, save 만 data.cnt_merge 추가.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { CategoryAllRow, CategoryFilters, CategoryRow } from "./types";

interface CactusMeta {
  txId?: string;
  success: boolean;
  code?: string;
  message?: string;
}

interface GridRows<T> {
  rows: T[];
}

/**
 * BPMN output="result" + Service Map 반환 패턴:
 *   cactus 가 data.result = Map<String,Object> 형태로 저장. Map 내부 List 는 cactus 가
 *   자동 분리 안 함 — FE 가 data.result.{key} 로 직접 접근.
 */
interface CactusResponse<TData = Record<string, unknown>> {
  meta: CactusMeta;
  data?: {
    result?: {
      cnt_merge?: number;
      list?: CategoryRow[];
      allList?: CategoryAllRow[];
    };
  } & TData;
  grids?: {
    list?: GridRows<CategoryRow>;
    allList?: GridRows<CategoryAllRow>;
  };
}

export type SaveRow = Record<string, unknown> & {
  rowKey: string;
  rowStatus: "C" | "U" | "D";
};

export interface SearchResult {
  list: CategoryRow[];
  allList: CategoryAllRow[];
}

export interface SaveResult {
  cntMerge: number;
  list: CategoryRow[];
  allList: CategoryAllRow[];
}

export interface MasterCategoryMngRepository {
  search(filters: CategoryFilters): Promise<SearchResult>;
  save(rows: SaveRow[]): Promise<SaveResult>;
}

const ENDPOINT_SEARCH = "/api/mcm/oasis/masterCategoryMng/search";
const ENDPOINT_SAVE = "/api/mcm/oasis/masterCategoryMng/save";

export function createMasterCategoryMngRepository(): MasterCategoryMngRepository {
  return {
    async search(filters) {
      const body = {
        meta: { menuId: "masterCategoryMng" },
        params: {
          pCodeId: filters.pCodeId ?? "",
          pCodeNm: filters.pCodeNm ?? "",
          pCategoryId: filters.pCategoryId ?? "",
          pCategoryNm: filters.pCategoryNm ?? "",
        },
      };
      const res = await apiRequest<CactusResponse>(ENDPOINT_SEARCH, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "조회 실패");
      }
      return {
        list: res.data?.result?.list ?? res.grids?.list?.rows ?? [],
        allList: res.data?.result?.allList ?? res.grids?.allList?.rows ?? [],
      };
    },

    async save(rows) {
      const body = {
        meta: { menuId: "masterCategoryMng" },
        grids: {
          master: { rows },
        },
      };
      const res = await apiRequest<CactusResponse<{ cnt_merge?: number }>>(ENDPOINT_SAVE, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.meta?.success) {
        throw new Error(res.meta?.message ?? "저장 실패");
      }
      return {
        cntMerge: Number(res.data?.result?.cnt_merge ?? 0),
        list: res.data?.result?.list ?? res.grids?.list?.rows ?? [],
        allList: res.data?.result?.allList ?? res.grids?.allList?.rows ?? [],
      };
    },
  };
}
