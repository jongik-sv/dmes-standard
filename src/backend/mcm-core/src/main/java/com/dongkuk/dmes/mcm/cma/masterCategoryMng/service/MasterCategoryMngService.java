package com.dongkuk.dmes.mcm.cma.masterCategoryMng.service;

import com.dongkuk.dmes.mcm.cma.masterCategoryMng.dto.MasterCategoryMngSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.dongkuk.dmes.mcm.entity.MasterCode;
import com.dongkuk.dmes.mcm.entity.MasterCodeCategory;
import com.dongkuk.dmes.mcm.entity.MasterCodeCategoryId;
import com.dongkuk.dmes.mcm.repository.MasterCodeCategoryRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.blankToNull;

/**
 * 카테고리 관리 — masterCategoryMng OASIS 서비스 (Spring bean = {@code masterCategoryMngService}).
 *
 * <p>BPMN {@code masterCategoryMng.bpmn} 의 두 ServiceTask 진입점:
 * <ul>
 *   <li>{@link #search(MasterCategoryMngSearchRequest)} — action=search (분석 §6 SQL #1 + #2)</li>
 *   <li>{@link #save(List)} — action=save (분석 §7 SaveTbMcmCodeCategory.run() + 후속 재조회)</li>
 * </ul>
 *
 * <p>As-Is {@code SaveTbMcmCodeCategory} (Java) 의 nativeeditor_status 분기 (updated/deleted/inserted) 는
 * To-Be rowStatus (U/D/C) 로 매핑되며 한 트랜잭션 내 일괄 처리 — dao.update() ≤ 0 정책은 JPA 의
 * dirty checking 으로 대체 (analytic §7.2 단계 5.1~5.3).
 *
 * <p>As-Is 로그 메시지 오타 "MasterCodeMapper.*" 는 To-Be "MasterCategoryMngMapper.*" 로 정정
 * (사용자 결정 §12).
 *
 * <p>중복체크 통합 (사용자 결정 §12) — 클라이언트 사이드 검증은 FE 에서 보존, 본 서비스도 PK 충돌
 * 시 BusinessException 던져 server-side guard. As-Is 클라이언트만 보호하던 정책을 강화.
 */
@Service("masterCategoryMngService")
public class MasterCategoryMngService {

    private static final Logger log = LoggerFactory.getLogger(MasterCategoryMngService.class);

    private final MasterCodeCategoryRepository categoryRepository;

    public MasterCategoryMngService(MasterCodeCategoryRepository categoryRepository) {
        this.categoryRepository = categoryRepository;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — As-Is GetCodeCategoryList + GetCodeCategoryAllList 통합 결과.
     *
     * <p>FE 는 ds_grdMain ← list / ds_grdMainAll ← allList 두 키를 모두 사용 (xfdl:150) → 본
     * 메서드 응답 = {@code { "list": [...], "allList": [...] }}.
     *
     * <p>각 행 키 = camelCase (FE 그리드와 일치): masterCode / codeNm / categoryId / categoryNm / sortSeq.
     */
    public Map<String, Object> search(MasterCategoryMngSearchRequest request) {
        if (request == null) request = new MasterCategoryMngSearchRequest();
        String pCodeId = nz(request.getPCodeId());
        String pCodeNm = nz(request.getPCodeNm());
        String pCategoryId = nz(request.getPCategoryId());
        String pCategoryNm = nz(request.getPCategoryNm());

        // SQL #1 GetCodeCategoryList — 그리드 5 컬럼
        List<Object[]> rows = categoryRepository.searchList(
                blankToNull(pCodeId), blankToNull(pCodeNm),
                blankToNull(pCategoryId), blankToNull(pCategoryNm));
        List<Map<String, Object>> list = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            MasterCodeCategory c = (MasterCodeCategory) r[0];
            MasterCode m = (MasterCode) r[1];
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("masterCode", c.getId().getMasterCode());
            row.put("codeNm", m.getCodeNm());
            row.put("categoryId", c.getId().getCategoryId());
            row.put("categoryNm", c.getCategoryNm());
            row.put("sortSeq", c.getSortSeq());
            list.add(row);
        }

        // SQL #2 GetCodeCategoryAllList — 전체 키 (중복체크용)
        List<Object[]> allRows = categoryRepository.searchAllList();
        List<Map<String, Object>> allList = new ArrayList<>(allRows.size());
        for (Object[] r : allRows) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("masterCode", r[0]);
            row.put("categoryId", r[1]);
            allList.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("allList", allList);
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — As-Is SaveTbMcmCodeCategory.run() (java:19~72) JPA 직역.
     *
     * <p>입력 master 리스트의 각 row.rowStatus (FE) 별 분기:
     * <ul>
     *   <li>"C" → INSERT (As-Is "inserted" — java:51~60)</li>
     *   <li>"U" → UPDATE (As-Is "updated" — java:33~42)</li>
     *   <li>"D" → DELETE (As-Is "deleted" — java:43~50)</li>
     * </ul>
     *
     * <p>트랜잭션: `@Transactional(rollbackFor = Exception.class)` — 한 행이라도 검증 실패 또는 PK
     * 충돌 시 BusinessException 던져 전체 롤백 (분석 §7.3).
     *
     * <p>서버 사이드 중복체크 추가 (사용자 결정 §12) — As-Is 는 클라이언트 단 보호만 있었으나
     * To-Be 는 Service 에서도 (1) 페이로드 내 PK 중복 (2) DB 기존 PK 충돌 (insert 시) 검증.
     *
     * @return {@code Map<String,Object>} — {@code cnt_merge} (처리 행수, xfdl:239 콜백 표시) +
     *         후속 재조회 결과 (list / allList). masterCodeMng 와 동일한 OASIS 표준 패턴
     *         (Map 반환 + BPMN {@code output="result"}) 으로 통일.
     */
    public Map<String, Object> save(List<Map<String, Object>> master) {
        if (master == null || master.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("cnt_merge", 0);
            return empty;
        }

        List<ErrorDetail> errors = new ArrayList<>();
        Set<String> payloadKeys = new HashSet<>();
        int cnt = 0;

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            String rowKey = strOf(row.get("rowKey"));
            String rowStatus = strOf(row.get("rowStatus"));
            String masterCode = strOf(row.get("masterCode"));
            String categoryId = strOf(row.get("categoryId"));

            // PK null 가드 (FE 검증 1~3 와 동일)
            if (isBlank(masterCode)) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "masterCode",
                        ErrorCode.REQUIRED_VALUE.getCode(), "코드ID를 입력해 주십시오."));
                continue;
            }
            if (isBlank(categoryId)) {
                errors.add(ErrorDetail.ofGrid("master", rowKey, i, "categoryId",
                        ErrorCode.REQUIRED_VALUE.getCode(), "카테고리 ID를 입력해 주십시오."));
                continue;
            }

            // 페이로드 PK 중복 가드 (As-Is xfdl:189~206 FE 중복체크 + To-Be 서버 강화)
            String pkSig = masterCode + "::" + categoryId;
            if ("C".equals(rowStatus) || "U".equals(rowStatus)) {
                if (!payloadKeys.add(pkSig)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "categoryId",
                            ErrorCode.DUPLICATE_DATA.getCode(),
                            "중복된 카테고리 ID가 존재합니다."));
                    continue;
                }
            }

            MasterCodeCategoryId id = new MasterCodeCategoryId(masterCode, categoryId);

            if ("C".equals(rowStatus)) {
                // INSERT — As-Is "inserted" 분기 (java:51~60, Mapper.xml:54~69)
                if (categoryRepository.existsById(id)) {
                    errors.add(ErrorDetail.ofGrid("master", rowKey, i, "categoryId",
                            ErrorCode.DUPLICATE_DATA.getCode(),
                            "전체 마스터 내 중복된 코드값이 존재합니다."));
                    continue;
                }
                MasterCodeCategory entity = new MasterCodeCategory();
                entity.setId(id);
                entity.setCategoryNm(strOf(row.get("categoryNm")));
                entity.setSortSeq(toInt(row.get("sortSeq")));
                try {
                    categoryRepository.save(entity);
                    cnt++;
                } catch (Exception e) {
                    log.error("MasterCategoryMngMapper.InsertTbMcmCodeCategory 에러발생", e);
                    throw new RuntimeException("MasterCategoryMngMapper.InsertTbMcmCodeCategory 에러발생", e);
                }
            } else if ("U".equals(rowStatus)) {
                // UPDATE — As-Is "updated" 분기 (java:33~42, Mapper.xml:39~46)
                MasterCodeCategory entity = categoryRepository.findById(id).orElse(null);
                if (entity == null) {
                    log.error("MasterCategoryMngMapper.UpdateTbMcmCodeCategory 에러발생 — id={} 미존재", id);
                    throw new RuntimeException("MasterCategoryMngMapper.UpdateTbMcmCodeCategory 에러발생");
                }
                entity.setCategoryNm(strOf(row.get("categoryNm")));
                entity.setSortSeq(toInt(row.get("sortSeq")));
                categoryRepository.save(entity);
                cnt++;
            } else if ("D".equals(rowStatus)) {
                // DELETE — As-Is "deleted" 분기 (java:43~50, Mapper.xml:48~52)
                if (!categoryRepository.existsById(id)) {
                    log.error("MasterCategoryMngMapper.DeleteTbMcmCodeCategory 에러발생 — id={} 미존재", id);
                    throw new RuntimeException("MasterCategoryMngMapper.DeleteTbMcmCodeCategory 에러발생");
                }
                categoryRepository.deleteById(id);
                cnt++;
            }
            // 그 외 rowStatus (빈 문자열 등) 는 변경 없음 — skip
        }

        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }

        log.debug("##########\tMaster Code 관리 Main 저장 완료 — cnt_merge={}", cnt);

        // 후속 재조회 — As-Is BPMN flow (UserTask → Task_2 → Task_0lk57sx) 와 동일 의미.
        // 결과 = { cnt_merge, list, allList } — masterCodeMng 와 동일 패턴.
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        Map<String, Object> reloaded = search(new MasterCategoryMngSearchRequest());
        out.put("list", reloaded.get("list"));
        out.put("allList", reloaded.get("allList"));
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String nz(String s) {
        return s == null ? "" : s.trim();
    }

    private static Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.intValue();
        String s = o.toString().trim();
        if (s.isEmpty()) return null;
        try { return Integer.parseInt(s); } catch (NumberFormatException e) { return null; }
    }
}
