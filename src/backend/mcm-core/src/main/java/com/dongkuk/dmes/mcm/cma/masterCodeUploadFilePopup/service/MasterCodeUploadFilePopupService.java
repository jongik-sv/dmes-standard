/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup Service (bean = "masterCodeUploadFilePopupService").
 *
 *       BPMN action 2 종:
 *         - search : SQL #1 GetCodeUploadList — As-Is MasterCodeUploadFilePopupMapper.GetCodeUploadList 1:1
 *         - save   : DELETE (조건부) + N INSERT — As-Is SaveMasterCodeFileUpload.java:20-76 1:1 직역
 *
 *       사용자 결정 (분석 §12):
 *         - mcm-core McmAuditEntity 9 컬럼 자동 채움 (As-Is ref_Audit fragment 폐기)
 *         - CODE_VER "1" 고정 (As-Is java:55 보존)
 *         - String.valueOf() 방어 보강 (F-003) — Excel cell 이 number 로 cast 되어도 안전
 *         - 사전 PK 중복 검증 (F-005) — chk_regFlag=false 시 Excel 내부 + DB 충돌 모두 사전 검출
 *         - atomic 트랜잭션 (전체 rollback) — @Transactional(rollbackFor = Exception.class)
 *         - 오류 row index 통지 (F-002) — BusinessException 의 ErrorDetail.ofGrid 로 행 단위 통지
 *
 *       Entity 재사용: 동일 테이블 TB_MCM_CODE_DETAIL 을 매핑하는 기존 Entity
 *         com.dongkuk.dmes.mcm.entity.MasterCodeDetail (@EmbeddedId 패턴)
 *         + MasterCodeDetailRepository 의 신규 native 메서드 (findCodeUploadListAsIs / deleteByMasterCodeAsIs).
 *
 *       NOTE: 본 서비스는 @RestController 가 아니라 OASIS BPMN UserTask 의 camunda:class 빈으로 호출된다.
 *             OasisServiceExecutor 가 본 빈을 lookup 후 method 를 reflection 호출.
 */
package com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.service;

import com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.dto.MasterCodeUploadFilePopupResponse;
import com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.dto.MasterCodeUploadFilePopupSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.exception.ErrorDetail;
import com.dongkuk.dmes.mcm.entity.MasterCodeDetail;
import com.dongkuk.dmes.mcm.entity.MasterCodeDetailId;
import com.dongkuk.dmes.mcm.repository.MasterCodeDetailRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

@Service("masterCodeUploadFilePopupService")
public class MasterCodeUploadFilePopupService {

    private final MasterCodeDetailRepository repository;

    public MasterCodeUploadFilePopupService(MasterCodeDetailRepository repository) {
        this.repository = repository;
    }

    /**
     * BPMN action=search — As-Is MasterCodeUploadFilePopupMapper.GetCodeUploadList 1:1.
     *
     * <pre>
     *   SELECT 7 cols FROM MCM_SOURCE.TB_MCM_CODE_DETAIL WHERE MASTER_CODE = :pCodeId
     *    ORDER BY CATEGORY_ID, SORT_SEQ
     * </pre>
     */
    public List<MasterCodeUploadFilePopupResponse> searchCodeUploadList(
            MasterCodeUploadFilePopupSearchRequest request) {
        if (request == null || isBlank(request.getPCodeId())) {
            return List.of();
        }
        List<Object[]> rows = repository.findCodeUploadListAsIs(request.getPCodeId());
        List<MasterCodeUploadFilePopupResponse> list = new ArrayList<>(rows.size());
        for (Object[] arr : rows) {
            MasterCodeUploadFilePopupResponse r = new MasterCodeUploadFilePopupResponse();
            r.setMasterCode(strOf(arr[0]));
            r.setCategoryId(strOf(arr[1]));
            r.setCodeVal(strOf(arr[2]));
            r.setCodeValMean(strOf(arr[3]));
            r.setCodeValDesc(strOf(arr[4]));
            r.setCodeVer(strOf(arr[5]));
            r.setSortSeq(strOf(arr[6]));
            list.add(r);
        }
        return list;
    }

    /**
     * BPMN action=save — As-Is SaveMasterCodeFileUpload.run() 1:1 직역 + 사용자 결정 보강.
     *
     * <pre>
     *   1. pRegFlag == "true" : DELETE FROM TB_MCM_CODE_DETAIL WHERE MASTER_CODE = :pCodeId  (java:40-45)
     *   2. for (row in ds_grdUpload) : INSERT 7 컬럼 + audit 9 컬럼 자동 (java:47-66)
     *   3. atomic — 한 row 라도 INSERT 실패 시 전체 rollback (java:58-61)
     * </pre>
     *
     * @param pCodeId    호출자 sMasterCode (As-Is xfdl:218 `gfn_setParam("pCodeId", ...)`)
     * @param pRegFlag   chk_regFlag (As-Is xfdl:219 — "true" 일 때만 선 DELETE)
     * @param dsGrdUpload Excel 미리보기 dataset (As-Is xfdl:216 `sInDatasets="ds_grdUpload=ds_grdUpload"`)
     * @return cnt_import — INSERT 성공 row 수 (As-Is java:68 `addDaoResultIntoContext(..., "cnt_import", cnt, ...)`)
     */
    public int saveMasterCodeFileUpload(String pCodeId, String pRegFlag,
                                        List<Map<String, Object>> dsGrdUpload) {
        // S3 — 입력 검증 (As-Is 는 검증 없음 — 사용자 결정 F-005 사전 검증 보강)
        if (isBlank(pCodeId)) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                    "코드ID(pCodeId)는 필수입니다.", List.of());
        }
        List<Map<String, Object>> rows = (dsGrdUpload != null) ? dsGrdUpload : List.of();

        // S5/S7 — As-Is param Map clear + counter (java:33, 37)
        int cnt = 0;
        List<ErrorDetail> errors = new ArrayList<>();

        // S8a (사전 PK 중복 검증 — F-005 보강): Excel 내부 (MASTER_CODE, CATEGORY_ID, CODE_VAL) 중복 검출.
        // chk_regFlag=true 라도 Excel 내부 중복은 동일 PK 두 번 INSERT → 두 번째 실패 → rollback 위험.
        // 사용자 결정 (분석 §12) — 사전 검증으로 명시적 실패 메시지 제공.
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            // PK 빈 값 사전 검증 — Oracle 은 '' 를 NULL 로 받아(oracle-1007) INSERT 가 ORA-01400 으로 실패한다.
            // null·빈 글자·공백 PK 는 DB 에 보내기 전에 행 번호와 함께 막는다.
            if (isBlank(row.get("MASTER_CODE")) || isBlank(row.get("CATEGORY_ID")) || isBlank(row.get("CODE_VAL"))) {
                errors.add(ErrorDetail.ofGrid("master", String.valueOf(row.get("CODE_VAL")), i, "codeVal", "REQ",
                        "(MASTER_CODE, CATEGORY_ID, CODE_VAL) 는 비울 수 없습니다. row=" + i));
                continue;
            }
            String mc = String.valueOf(row.get("MASTER_CODE"));
            String ci = String.valueOf(row.get("CATEGORY_ID"));
            String cv = String.valueOf(row.get("CODE_VAL"));
            String pkKey = mc + "" + ci + "" + cv;
            if (!seen.add(pkKey)) {
                errors.add(ErrorDetail.ofGrid("master", cv, i, "codeVal", "DUP",
                        "Excel 내부에 중복된 (MASTER_CODE, CATEGORY_ID, CODE_VAL) 이 있습니다. row=" + i));
            }
        }
        if (!errors.isEmpty()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                    "Excel 의 PK 칸이 비었거나 내부 중복이 검출되었습니다.", errors);
        }

        // S8 (선삭제) — As-Is java:40-45 1:1 (조건부)
        boolean regFlagTrue = "true".equals(pRegFlag);
        if (regFlagTrue) {
            repository.deleteByMasterCodeAsIs(pCodeId);
            // 같은 트랜잭션에서 DELETE 직후 INSERT 가 이어지므로 영속성 컨텍스트 동기화.
            repository.flush();
        }

        // S9 (반복 INSERT) — As-Is java:47-66 1:1 (JPA save() — audit 9 컬럼 자동 채움)
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);

            // F-003 보강: String.valueOf() 로 ClassCastException 방지 (Excel cell 이 number 일 때 대응)
            String masterCode = String.valueOf(row.get("MASTER_CODE"));
            String categoryId = String.valueOf(row.get("CATEGORY_ID"));
            String codeVal    = String.valueOf(row.get("CODE_VAL"));

            MasterCodeDetailId id = new MasterCodeDetailId(masterCode, categoryId, codeVal);

            // chk_regFlag=false 시 DB 충돌 사전 검증 (F-005 보강).
            // regFlagTrue 라면 위 DELETE 로 이미 본 MASTER_CODE 의 row 는 전부 사라졌으므로 EXISTS 체크 생략.
            if (!regFlagTrue && repository.existsById(id)) {
                errors.add(ErrorDetail.ofGrid("master", codeVal, i, "codeVal", "WR",
                        "DB 에 이미 존재하는 (MASTER_CODE, CATEGORY_ID, CODE_VAL) 입니다. row=" + i));
                continue;
            }

            MasterCodeDetail entity = new MasterCodeDetail();
            entity.setId(id);
            entity.setCodeValMean(String.valueOf(row.get("CODE_VAL_MEAN")));
            entity.setCodeValDesc(String.valueOf(row.get("CODE_VAL_DESC")));
            // As-Is java:55 — CODE_VER "1" 고정
            entity.setCodeVer("1");
            // SORT_SEQ — As-Is dataset STRING(256) (xfdl:127-136). Entity 는 Long 타입 →
            // 숫자 변환 시도. 빈문자 / 비숫자 / null 은 null 처리 (As-Is xml 의 dynamic if-block 동작 유지).
            entity.setSortSeq(toLong(row.get("SORT_SEQ")));

            try {
                repository.save(entity);
                cnt++;
            } catch (Exception e) {
                // F-002 보강: row index 포함 메시지
                errors.add(ErrorDetail.ofGrid("master", codeVal, i, "codeVal", "ER",
                        "INSERT 실패 (row=" + i + "): " + e.getMessage()));
                // atomic 보존 — As-Is java:58-61 의 throw new Exception 1:1
                throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                        "TB_MCM_CODE_DETAIL_Mapper.insert 에러발생", errors);
            }
        }

        if (!errors.isEmpty()) {
            // chk_regFlag=false PK 충돌 사전 검증 errors — atomic rollback
            throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                    "기존 데이터와 PK 가 충돌합니다. 삭제등록 옵션을 사용하거나 충돌 row 를 제거하세요.", errors);
        }

        return cnt;
    }

    // ── helpers ──
    private static boolean isBlank(Object v) {
        return v == null || (v instanceof String s && s.isBlank());
    }
    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        String s = v.toString();
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) return null;
        try {
            return Long.valueOf(s.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
