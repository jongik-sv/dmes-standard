package com.dongkuk.dmes.mcm.cma.masterCodeMng.service;

import com.dongkuk.dmes.mcm.cma.masterCodeMng.dto.MasterCodeDetailSearchRequest;
import com.dongkuk.dmes.mcm.cma.masterCodeMng.dto.MasterCodeSearchRequest;
import com.dongkuk.dmes.mcm.entity.MasterCode;
import com.dongkuk.dmes.mcm.entity.MasterCodeCategory;
import com.dongkuk.dmes.mcm.entity.MasterCodeDetail;
import com.dongkuk.dmes.mcm.entity.MasterCodeDetailId;
import com.dongkuk.dmes.mcm.repository.MasterCodeCategoryRepository;
import com.dongkuk.dmes.mcm.repository.MasterCodeDetailRepository;
import com.dongkuk.dmes.mcm.repository.MasterCodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * Master Code Management - OASIS BPMN serviceTask entry point.
 *
 * <p>Spring bean name {@code masterCodeMngService} =&gt; BPMN
 * {@code <camunda:class>masterCodeMngService</camunda:class>}.
 *
 * <p>Maps the 13 active SQL IDs from analysis report section 6 (of original 16, with 3 unused
 * removed per decision log section 12) to JPA Repository calls:
 * <ol>
 *   <li>GetCodeMasterList -- MasterCodeRepository.findByFilter</li>
 *   <li>GetCodeMasterAllList -- MasterCodeRepository.findAllForLov</li>
 *   <li>MergeTbMcmCodeMaster -- MasterCodeRepository.save (IF EXISTS pattern, analysis section 11 #1)</li>
 *   <li>GetCodeDetailList -- MasterCodeDetailRepository.findByMasterCode</li>
 *   <li>GetCodeDetailRef1~5List -- MasterCodeDetailRepository.findRefByMasterRefCodeId (5 calls)</li>
 *   <li>GetTbMcmCodeCategoryList -- MasterCodeCategoryRepository.findByMasterCode</li>
 *   <li>UpdateTbMcmCodeDetail / DeleteTbMcmCodeDetail / InsertTbMcmCodeDetail --
 *       MasterCodeDetailRepository.save / deleteById (status branch)</li>
 * </ol>
 *
 * <p>Removed 3 unused SQL: DeleteTbMcmCodeMaster / DeleteTbMcmCodeDetail_old /
 * MergeTbMcmCodeDetail (As-Is never invoked, per analysis section 12 decision log).
 *
 * <p>Audit 9 columns (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID /
 * U_PGM_ID / VER) are auto-populated by mcm-core McmAuditListener via JPA
 * PrePersist / PreUpdate callbacks - service body does not set them.
 *
 * <p>BPMN definition: {@code services/cma/masterCodeMng.bpmn} - 4 actions
 * (search / searchDetail / save / saveDetail).
 */
@Service("masterCodeMngService")
public class MasterCodeMngService {

    private static final Logger log = LoggerFactory.getLogger(MasterCodeMngService.class);

    /**
     * To-Be 정정 — As-Is {@code TO_DATE('99991231115959','YYYYMMDDHH24MISS')} 의 11:59:59 오타
     * → {@code 9999-12-31 23:59:59} (사용자 결정 §11 #4 / §12).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 23, 59, 59);

    private final MasterCodeRepository masterCodeRepository;
    private final MasterCodeDetailRepository masterCodeDetailRepository;
    private final MasterCodeCategoryRepository masterCodeCategoryRepository;

    public MasterCodeMngService(MasterCodeRepository masterCodeRepository,
                                MasterCodeDetailRepository masterCodeDetailRepository,
                                MasterCodeCategoryRepository masterCodeCategoryRepository) {
        this.masterCodeRepository = masterCodeRepository;
        this.masterCodeDetailRepository = masterCodeDetailRepository;
        this.masterCodeCategoryRepository = masterCodeCategoryRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — Master 그리드 + Master 전체 LoV
    // BPMN: searchTask + searchAllTask (단일 method 반환 Map)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code search} 진입점. As-Is BPMN flow: Task_2 (GetCodeMasterList) → Task_1ys7qxh
     * (GetCodeMasterAllList). To-Be 는 단일 method 가 두 Repository call 후 Map 으로 wrap 반환.
     *
     * <p>OASIS executor 가 본 Map 을 process variable 에 풀어 callback 으로 전달.
     */
    public Map<String, Object> search(MasterCodeSearchRequest request) {
        String pCodeId = request != null ? request.getPCodeId() : null;
        String pCodeNm = request != null ? request.getPCodeNm() : null;

        List<MasterCode> rows = masterCodeRepository.findByFilter(pCodeId, pCodeNm);
        List<MasterCode> all = masterCodeRepository.findAllForLov();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetCodeMasterList", rows.stream().map(this::toMasterRow).toList());
        out.put("ds_GetCodeMasterAllList", all.stream().map(this::toMasterLovRow).toList());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchDetail — Category + Detail + Ref1~5 + Master 전체
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchDetail} 진입점. As-Is BPMN flow:
     * Task_0zyza07 (Category) → Task_1uvph9e (Detail) → Task_1owudha~Task_1f6jrjg (Ref1~5)
     * → Task_1ys7qxh (Master 전체 LoV). 모두 단일 method 로 합쳐 Map 반환.
     */
    public Map<String, Object> searchDetail(MasterCodeDetailSearchRequest request) {
        if (request == null || request.getPCodeId() == null || request.getPCodeId().isBlank()) {
            return Map.of();
        }
        String pCodeId = request.getPCodeId();

        List<MasterCodeCategory> categories = masterCodeCategoryRepository.findByMasterCode(pCodeId);
        List<MasterCodeDetail> details = masterCodeDetailRepository.findByMasterCode(pCodeId);

        // Detail row 의 CATEGORY_NM 은 scalar subquery (xml:110) — JPA 측은 Category map 으로 lookup.
        Map<String, String> categoryNmMap = new HashMap<>();
        for (MasterCodeCategory c : categories) {
            categoryNmMap.put(c.getId().getCategoryId(), c.getCategoryNm());
        }

        // MASTER outer-join (xml:128~130) — MASTER_CODE_REF1~5 alias 위해 Master fetch.
        Optional<MasterCode> mainMasterOpt = masterCodeRepository.findById(pCodeId);
        MasterCode mainMaster = mainMasterOpt.orElse(null);

        List<Map<String, Object>> detailRows = new ArrayList<>(details.size());
        for (MasterCodeDetail d : details) {
            detailRows.add(toDetailRow(d, categoryNmMap, mainMaster));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetTbMcmCodeCategoryList", categories.stream().map(this::toCategoryRow).toList());
        out.put("ds_GetCodeDetailList", detailRows);
        out.put("ds_codeValRef1", findRef(request.getPMasterCodeRef1()));
        out.put("ds_codeValRef2", findRef(request.getPMasterCodeRef2()));
        out.put("ds_codeValRef3", findRef(request.getPMasterCodeRef3()));
        out.put("ds_codeValRef4", findRef(request.getPMasterCodeRef4()));
        out.put("ds_codeValRef5", findRef(request.getPMasterCodeRef5()));
        out.put("ds_GetCodeMasterAllList",
                masterCodeRepository.findAllForLov().stream().map(this::toMasterLovRow).toList());
        return out;
    }

    private List<Map<String, Object>> findRef(String pMasterCodeRef) {
        if (pMasterCodeRef == null || pMasterCodeRef.isBlank()) {
            return List.of();
        }
        return masterCodeDetailRepository.findRefByMasterRefCodeId(pMasterCodeRef).stream()
                .map(d -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("CODE_VAL", d.getId().getCodeVal());
                    row.put("CODE_VAL_MEAN", d.getCodeValMean());
                    return row;
                })
                .toList();
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — Master 그리드 일괄 저장 (MERGE 반복) + 후속 search 재조회
    // BPMN: saveMasterTask (단일 method)
    // As-Is SaveTbMcmCodeMaster.java for-loop MergeTbMcmCodeMaster.
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code save} 진입점. As-Is {@code SaveTbMcmCodeMaster.java} 의 for-loop
     * MERGE 단건 호출 (java:30~52) 을 JPA {@code save()} (PK 존재 시 UPDATE / 미존재 시 INSERT)
     * 패턴으로 변환. analysis §11 #1 의 MSSQL IF EXISTS 패턴 권장에 정합.
     *
     * <p>입력: {@code ds_grdMain} = {@code List<Map<String, Object>>} (16 컬럼 + rowStatus).
     * As-Is xfdl 은 변경 행만 :U 마킹으로 전송 (xfdl:399) → rowStatus = inserted / updated.
     * 본 method 는 모든 행에 대해 save() 호출 (JPA upsert).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) — As-Is callback "{N}건 저장 되었습니다." 와 정합.
     */
    public Map<String, Object> save(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String codeId = strOf(row.get("CODE_ID"));
                if (codeId == null || codeId.isBlank()) {
                    log.warn("[masterCodeMng.save] CODE_ID null — skip row");
                    continue;
                }
                MasterCode entity = masterCodeRepository.findById(codeId).orElseGet(MasterCode::new);
                boolean isNew = entity.getCodeId() == null;
                entity.setCodeId(codeId);
                entity.setCodeNm(strOf(row.get("CODE_NM")));
                entity.setCodeDesc(strOf(row.get("CODE_DESC")));
                entity.setCodeVer(strOf(row.get("CODE_VER")));
                entity.setUseTp(strOf(row.get("USE_TP")));
                entity.setMasterCode(strOf(row.get("MASTER_CODE")));
                entity.setMasterCodeRef1(strOf(row.get("MASTER_CODE_REF1")));
                entity.setMasterCodeRef2(strOf(row.get("MASTER_CODE_REF2")));
                entity.setMasterCodeRef3(strOf(row.get("MASTER_CODE_REF3")));
                entity.setMasterCodeRef4(strOf(row.get("MASTER_CODE_REF4")));
                entity.setMasterCodeRef5(strOf(row.get("MASTER_CODE_REF5")));
                entity.setCodeOwnerDeptNm(strOf(row.get("CODE_OWNER_DEPT_NM")));
                entity.setCodeOwnerEmpNo(strOf(row.get("CODE_OWNER_EMP_NO")));
                entity.setCodeCharacter(strOf(row.get("CODE_CHARACTER")));
                if (isNew) {
                    // As-Is xml:93 SYSDATE — INSERT 만 적용. END_ACTIVE_DATE 는 정정값.
                    entity.setStartActiveDate(LocalDateTime.now());
                    entity.setEndActiveDate(END_OF_TIME);
                }
                masterCodeRepository.save(entity);
                cnt++;
            }
        }
        // 저장 후 후속 search 재조회 — As-Is BPMN flow: UserTask → Task_2 → Task_1ys7qxh
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_GetCodeMasterList",
                masterCodeRepository.findAllForLov().stream().map(this::toMasterRow).toList());
        out.put("ds_GetCodeMasterAllList",
                masterCodeRepository.findAllForLov().stream().map(this::toMasterLovRow).toList());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveDetail — Detail status 분기 (update/delete/insert) + 후속 searchDetail
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveDetail} 진입점. As-Is {@code SaveTbMcmCodeDetail.java} 의 for-loop
     * status 분기 (updated/deleted/inserted, java:30~78) 변환.
     *
     * <p>입력: {@code ds_grdDetail} = List<Map> (status 분기 컬럼 — !nativeeditor_status 또는 rowStatus).
     * 본 method 는 rowStatus 값 ("updated"/"deleted"/"inserted") 기준으로 JPA 호출 분기.
     *
     * <p>PK 복합 = (MASTER_CODE, CATEGORY_ID, CODE_VAL) — As-Is Mapper WHERE 와 동일.
     */
    public Map<String, Object> saveDetail(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    // As-Is Nexacro 시스템 컬럼 fallback
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String masterCode = strOf(row.get("MASTER_CODE"));
                String categoryId = strOf(row.get("CATEGORY_ID"));
                String codeVal = strOf(row.get("CODE_VAL"));
                // PK 3칸은 null 뿐 아니라 빈·공백 글자도 거른다 — Oracle 은 '' 를 NULL 로 받아(oracle-1007)
                // INSERT 는 ORA-01400 으로 실패하고, 삭제·존재 확인은 조용히 0 건이 된다.
                if (isBlankPk(masterCode) || isBlankPk(categoryId) || isBlankPk(codeVal)) {
                    log.warn("[masterCodeMng.saveDetail] PK null/blank — skip row (status={})", status);
                    continue;
                }
                MasterCodeDetailId id = new MasterCodeDetailId(masterCode, categoryId, codeVal);

                if ("deleted".equals(status) || "D".equals(status)) {
                    if (masterCodeDetailRepository.existsById(id)) {
                        masterCodeDetailRepository.deleteById(id);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    MasterCodeDetail entity = masterCodeDetailRepository.findById(id)
                            .orElseGet(MasterCodeDetail::new);
                    entity.setId(id);
                    entity.setCodeValMean(strOf(row.get("CODE_VAL_MEAN")));
                    entity.setCodeValDesc(strOf(row.get("CODE_VAL_DESC")));
                    entity.setSortSeq(longOf(row.get("SORT_SEQ")));
                    entity.setCodeValRef1(strOf(row.get("CODE_VAL_REF1")));
                    entity.setCodeValRef2(strOf(row.get("CODE_VAL_REF2")));
                    entity.setCodeValRef3(strOf(row.get("CODE_VAL_REF3")));
                    entity.setCodeValRef4(strOf(row.get("CODE_VAL_REF4")));
                    entity.setCodeValRef5(strOf(row.get("CODE_VAL_REF5")));
                    if ("inserted".equals(status) || "C".equals(status)) {
                        entity.setCodeVer(strOf(row.get("CODE_VER")));
                    }
                    masterCodeDetailRepository.save(entity);
                    cnt++;
                } else {
                    log.warn("[masterCodeMng.saveDetail] unknown status={} — skip", status);
                }
            }
        }
        // 후속 searchDetail 재조회 (단순화 — Detail + Master 전체 LoV 만 반환, Ref1~5 / Category 는
        // FE 의 다음 searchDetail action 으로 재로드 권장이지만 As-Is 와 정합 유지 위해 동일 호출)
        String pCodeId = (master != null && !master.isEmpty())
                ? strOf(master.get(0).get("MASTER_CODE"))
                : null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_mergeDetail", cnt);
        if (pCodeId != null) {
            List<MasterCodeDetail> details = masterCodeDetailRepository.findByMasterCode(pCodeId);
            Map<String, String> categoryNmMap = new HashMap<>();
            for (MasterCodeCategory c : masterCodeCategoryRepository.findByMasterCode(pCodeId)) {
                categoryNmMap.put(c.getId().getCategoryId(), c.getCategoryNm());
            }
            MasterCode mainMaster = masterCodeRepository.findById(pCodeId).orElse(null);
            List<Map<String, Object>> detailRows = new ArrayList<>(details.size());
            for (MasterCodeDetail d : details) {
                detailRows.add(toDetailRow(d, categoryNmMap, mainMaster));
            }
            out.put("ds_GetCodeDetailList", detailRows);
        } else {
            out.put("ds_GetCodeDetailList", List.of());
        }
        out.put("ds_GetCodeMasterAllList",
                masterCodeRepository.findAllForLov().stream().map(this::toMasterLovRow).toList());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — As-Is Mapper SELECT 결과 컬럼명 보존 (SNAKE_CASE)
    // ────────────────────────────────────────────────────────────────

    private Map<String, Object> toMasterRow(MasterCode m) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CODE_ID", m.getCodeId());
        row.put("CODE_NM", m.getCodeNm());
        row.put("CODE_DESC", m.getCodeDesc());
        row.put("CODE_VER", m.getCodeVer());
        row.put("USE_TP", m.getUseTp());
        row.put("START_ACTIVE_DATE", m.getStartActiveDate());
        row.put("END_ACTIVE_DATE", m.getEndActiveDate());
        row.put("CODE_OWNER_DEPT_NM", m.getCodeOwnerDeptNm());
        row.put("CODE_OWNER_EMP_NO", m.getCodeOwnerEmpNo());
        row.put("CODE_CHARACTER", m.getCodeCharacter());
        row.put("MASTER_CODE", m.getMasterCode());
        row.put("MASTER_CODE_REF1", m.getMasterCodeRef1());
        row.put("MASTER_CODE_REF2", m.getMasterCodeRef2());
        row.put("MASTER_CODE_REF3", m.getMasterCodeRef3());
        row.put("MASTER_CODE_REF4", m.getMasterCodeRef4());
        row.put("MASTER_CODE_REF5", m.getMasterCodeRef5());
        return row;
    }

    private Map<String, Object> toMasterLovRow(MasterCode m) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CODE_ID", m.getCodeId());
        row.put("CODE_NM", m.getCodeNm());
        return row;
    }

    private Map<String, Object> toCategoryRow(MasterCodeCategory c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CATEGORY_ID", c.getId().getCategoryId());
        row.put("CATEGORY_NM", c.getCategoryNm());
        return row;
    }

    /**
     * As-Is {@code GetCodeDetailList} (xml:106~132) 의 19 컬럼 row 조립:
     * Detail 본 컬럼 + scalar subquery CATEGORY_NM + MASTER outer-join MASTER_CODE_REF1~5.
     */
    private Map<String, Object> toDetailRow(MasterCodeDetail d,
                                            Map<String, String> categoryNmMap,
                                            MasterCode mainMaster) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("MASTER_CODE", d.getId().getMasterCode());
        row.put("CATEGORY_ID", d.getId().getCategoryId());
        row.put("CATEGORY_NM", categoryNmMap.getOrDefault(d.getId().getCategoryId(), null));
        row.put("SORT_SEQ", d.getSortSeq());
        row.put("CODE_VAL", d.getId().getCodeVal());
        row.put("CODE_VAL_MEAN", d.getCodeValMean());
        row.put("CODE_VAL_DESC", d.getCodeValDesc());
        row.put("CODE_VER", d.getCodeVer());
        row.put("CODE_VAL_REF1", d.getCodeValRef1());
        row.put("CODE_VAL_REF2", d.getCodeValRef2());
        row.put("CODE_VAL_REF3", d.getCodeValRef3());
        row.put("CODE_VAL_REF4", d.getCodeValRef4());
        row.put("CODE_VAL_REF5", d.getCodeValRef5());
        // As-Is MASTER LEFT JOIN alias — Detail 의 MASTER 측 MASTER_CODE_REF1~5
        row.put("MASTER_CODE_REF1", mainMaster != null ? mainMaster.getMasterCodeRef1() : null);
        row.put("MASTER_CODE_REF2", mainMaster != null ? mainMaster.getMasterCodeRef2() : null);
        row.put("MASTER_CODE_REF3", mainMaster != null ? mainMaster.getMasterCodeRef3() : null);
        row.put("MASTER_CODE_REF4", mainMaster != null ? mainMaster.getMasterCodeRef4() : null);
        row.put("MASTER_CODE_REF5", mainMaster != null ? mainMaster.getMasterCodeRef5() : null);
        return row;
    }

    private static Long longOf(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(o)); } catch (NumberFormatException e) { return null; }
    }

    /** PK 칸 빈 값 판정 — null·빈 글자·공백만 (Oracle '' = NULL). */
    private static boolean isBlankPk(String s) {
        return s == null || s.isBlank();
    }
}
