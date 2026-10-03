/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commMenuMng OASIS BPMN serviceTask entry point — 5 action (To-Be 정책 #1 적용)
 *       searchCmMenu / searchMenuGrp / saveCmMenu / searchObj / commonList
 */
package com.dongkuk.dmes.mcm.csa.commMenuMng.service;

import com.dongkuk.dmes.mcm.csa.commMenuMng.dto.CommMenuMngCommonListRequest;
import com.dongkuk.dmes.mcm.csa.commMenuMng.dto.CommMenuMngSearchObjRequest;
import com.dongkuk.dmes.mcm.csa.commMenuMng.dto.CommMenuMngSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.SecMenu;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commMenuMng — OASIS BPMN serviceTask entry point (W2 / csa 9 화면 2번째).
 *
 * <p>Spring bean name {@code commMenuMngService} → BPMN {@code <camunda:class>commMenuMngService</camunda:class>}.
 *
 * <p>BPMN action 5 (To-Be 정책 #1 적용 — As-Is 6 → To-Be 5, lov 폐기. 분석 §1 / 기능 §5.2 / BPMN §1.1):
 * <ol>
 *   <li>{@code searchCmMenu}  → {@link #searchCmMenu(CommMenuMngSearchRequest)} — 메뉴 리스트 조회 (selectCommMenuMng + selectMenuFldList chain)</li>
 *   <li>{@code searchMenuGrp} → {@link #searchMenuGrp()} — 메뉴 폴더 트리 단독 조회 (selectMenuFldList)</li>
 *   <li>{@code saveCmMenu}   → {@link #saveCmMenu(List)} — 메뉴 일괄 저장 (rowStatus 분기 inserted/updated/deleted)</li>
 *   <li>{@code searchObj}    → {@link #searchObj(CommMenuMngSearchObjRequest)} — 선택 메뉴의 OBJECT 정보 조회 (selectMenuObj)</li>
 *   <li>{@code commonList}   → {@link #commonList(CommMenuMngCommonListRequest)} — OBJECT 팝업 LoV (selectMenuObjPop)</li>
 *   <li>~~{@code lov}~~ — <b>To-Be 폐기</b> (cross-cutting 정책 #1 — BIZ_SYSTEM_CODE / APP_HOST_ID 도메인 / cross-namespace CommObjMngMapper.selectAppHostId 호출 모두 제거)</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — selectCommMenuMng 의 LEFT JOIN TB_MCM_SEC_OBJ / selectMenuFldList 의
 * CTE WITH RECURSIVE / selectMenuObj / selectMenuObjPop 은 모두 read-only → {@link SecMenuNativeRepository}
 * native query 어댑터 사용. Entity SecMenu 는 save / delete 트랜잭션에만 사용.
 *
 * <p>audit 9 컬럼 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 은
 * mcm-core {@code McmAuditListener} 가 JPA PrePersist / PreUpdate 콜백으로 자동 채움 — service body 미설정.
 *
 * <p>BPMN definition: {@code services/csa/commMenuMng/commMenuMng.bpmn}.
 */
@Service("commMenuMngService")
public class CommMenuMngService {

    private static final Logger log = LoggerFactory.getLogger(CommMenuMngService.class);

    /**
     * As-Is xfdl:691/721 행추가 default {@code "99991231"} 8자 → To-Be 정정 {@code 9999-12-31 00:00:00}.
     *
     * <p>2026-06-02 iter#3 사용자 검수 결과 (W5 commUserMng 정본) — AsIs Mapper insertCommMenuMng:74~75
     * {@code #{START_ACTIVE_DATE}} / {@code #{END_ACTIVE_DATE}} 직접 바인딩 (TO_DATE 변환 ✗) → Oracle DATE
     * 자동 변환 시 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00}.
     * 기존 23:59:59 → **00:00:00 정정** (AsIs 1:1 정합).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecMenuRepository secMenuRepository;
    private final SecMenuNativeRepository secMenuNativeRepository;

    public CommMenuMngService(SecMenuRepository secMenuRepository,
                              SecMenuNativeRepository secMenuNativeRepository) {
        this.secMenuRepository = secMenuRepository;
        this.secMenuNativeRepository = secMenuNativeRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmMenu — 메뉴 리스트 조회 (+ 메뉴 트리 chain 가공)
    // BPMN: As-Is Task_00oihyb → SequenceFlow_105vwsz chain → Task_0xxo78b → End
    // To-Be: 단일 service method 안에서 selectCommMenuMng + selectMenuFldList 동시 실행
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmMenu} 진입점. As-Is BPMN 의 Task_00oihyb (selectCommMenuMng) →
     * Task_0xxo78b chain (selectMenuFldList) 두 SQL 을 동시 호출.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecMenuNativeRepository#searchCmMenu(String, String, String, String)} —
     *       4 파라미터 (To-Be 정책 #1 — cbo_bizSystemCode 폐기)</li>
     *   <li>{@link SecMenuNativeRepository#searchMenuFld()} — 메뉴 트리 (CTE WITH RECURSIVE)</li>
     *   <li>{@code ds_menuList} + {@code ds_menuTreeList} 2 dataset 반환</li>
     * </ol>
     *
     * <p>As-Is fn_callBack 의 case "searchCmMenu" break 누락 (xfdl:587 — fall-through 로 searchMenuGrp 분기
     * 진입) 결함은 To-Be 에서 본 method 가 2 dataset 동시 반환으로 자동 흡수 (사용자 결정 — 분석 §12 As-Is 보존).
     */
    public Map<String, Object> searchCmMenu(CommMenuMngSearchRequest request) {
        String edtMenuId = request != null ? request.getEdtMENUID() : null;
        String pMenuId   = request != null ? request.getPMENUID()   : null;
        String edtMenuNm = request != null ? request.getEdtMENUNM() : null;
        String cboUseTp  = request != null ? request.getCboUSETP()  : null;

        List<Map<String, Object>> menuList = secMenuNativeRepository.searchCmMenu(
                edtMenuId, pMenuId, edtMenuNm, cboUseTp);
        List<Map<String, Object>> treeList = secMenuNativeRepository.searchMenuFld();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuList", menuList);
        out.put("ds_menuTreeList", treeList);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchMenuGrp — 메뉴 폴더 트리 단독 조회
    // BPMN: As-Is StartEvent → ExclusiveGateway → Task_0xxo78b → End
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchMenuGrp} 진입점. As-Is BPMN Task_0xxo78b 단독 호출 (selectMenuFldList).
     *
     * <p>As-Is fn_formAfterOnload (xfdl:429) — 화면 로드 후 메뉴 폴더 트리 사전 조회. To-Be 정책 #1: As-Is
     * cbo_bizSystemCode 파라미터 폐기 → 본 method 는 파라미터 0개.
     *
     * <p>응답: {@code ds_menuTreeList} (As-Is dataset 이름 보존).
     */
    public Map<String, Object> searchMenuGrp() {
        List<Map<String, Object>> treeList = secMenuNativeRepository.searchMenuFld();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuTreeList", treeList);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmMenu — 메뉴 일괄 저장 (rowStatus 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask → To-Be Service for-loop 명시 분기 (cma / W1 정본 패턴)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmMenu} 진입점. As-Is BPMN {@code CommonMultiSaveTask}
     * (insertSqlKey / updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (cma {@code MasterCodeMngService.saveDetail} /
     * W1 {@code CommObjMngService.saveCmObj} 정본 패턴).
     *
     * <p>입력: {@code master} = {@code List<Map>} — As-Is xfdl 의 {@code ds_menuList:U} (변경 행만,
     * rowStatus 포함).
     *
     * <p>status 분기:
     * <ul>
     *   <li>"inserted" / "C" → INSERT (JPA save() — PK 미존재 시 INSERT)</li>
     *   <li>"updated"  / "U" → UPDATE (JPA save() — PK 존재 시 UPDATE)</li>
     *   <li>"deleted"  / "D" → DELETE (PK 복합 (MENU_ID, MENU_SEQ) 로 deleteById)</li>
     * </ul>
     *
     * <p><b>PARENT_MENU_ID 는 그룹 폴더 MENU_ID 이며 필수다.</b> As-Is 의 {@code #{MENU_ID}} 자기참조
     * (xml:77/96 / 분석 §9.1 #12) 는 R3 트리 재설계(폴더=TB_MCM_SEC_MENU_FLD / 화면=본 테이블) 이후
     * 성립하지 않는다. 값이 비어 오면 {@code BusinessException} 으로 거부한다 — 자기참조로 저장하면
     * 트리·화면·LoV 어디에서도 복구할 수 없는 행이 된다 (2026-09-04 TE-006).
     *
     * <p>As-Is V-004 millisecond cut (fn_MsgSaveCallBack xfdl:649~659 — START/END_ACTIVE_DATE.toString().length > 8
     * 시 substring(0,8)) 은 To-Be parseLocalDateTime 안에서 8자 yyyyMMdd 변환으로 자동 흡수.
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_menuList} (재조회 결과 — As-Is fn_callBack
     * saveCmMenu 의 fn_search 재호출 정합 / cma 정본 패턴).
     */
    public Map<String, Object> saveCmMenu(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    // As-Is Nexacro 시스템 컬럼 fallback (cma / W1 정본 패턴)
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String menuId = strOf(row.get("MENU_ID"));
                String menuSeq = strOf(row.get("MENU_SEQ"));
                // 2026-06-05 — PK = MENU_ID 단독. MENU_SEQ 는 순수 순서 컬럼(PK ✗) 이므로 PK null 가드는 MENU_ID 만.
                if (menuId == null || menuId.isBlank()) {
                    log.warn("[commMenuMng.saveCmMenu] PK (MENU_ID) null — skip row (status={})", status);
                    continue;
                }

                if ("deleted".equals(status) || "D".equals(status)) {
                    if (secMenuRepository.existsById(menuId)) {
                        secMenuRepository.deleteById(menuId);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    SecMenu entity = secMenuRepository.findById(menuId).orElseGet(SecMenu::new);
                    boolean isNew = entity.getMenuId() == null;
                    // 신규 등록인데 MENU_ID 가 이미 존재 → 다른 화면 무단 덮어쓰기 방지 (MENU_ID 단독 PK = 화면당 유일).
                    if (!isNew && ("inserted".equals(status) || "C".equals(status))) {
                        throw new IllegalStateException("MENU_ID='" + menuId + "' 는 이미 존재합니다 (중복 등록 불가).");
                    }
                    entity.setMenuId(menuId);
                    // MENU_SEQ — 2026-06-05 사용자 지시: 저장 시 '0' LPAD 8자리 (예: "12" → "00000012").
                    //   MENU_ID 단독 PK 로 변경되어 MENU_SEQ 는 PK 가 아니므로 insert/update 모두 안전하게 LPAD.
                    entity.setMenuSeq(lpad8(menuSeq));
                    entity.setFullSeq(strOf(row.get("FULL_SEQ")));
                    entity.setMenuNm(strOf(row.get("MENU_NM")));
                    entity.setMenuDesc(strOf(row.get("MENU_DESC")));
                    entity.setMenuTp(strOf(row.get("MENU_TP")));
                    entity.setObjectId(strOf(row.get("OBJECT_ID")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"),
                            isNew ? LocalDateTime.now() : entity.getStartActiveDate()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"),
                            isNew ? END_OF_TIME : entity.getEndActiveDate()));
                    entity.setMenuViewYn(strOf(row.get("MENU_VIEW_YN")));
                    // PARENT_MENU_ID — 2026-06-04 사용자 지시 (FULL_SEQ 자동부여) 정합 정정:
                    //   As-Is xml:77/96 의 #{MENU_ID} 자기참조(setParentMenuId(menuId))는 R3 트리 재설계
                    //   (폴더=TB_MCM_SEC_MENU_FLD / 화면 PARENT_MENU_ID = 그룹 폴더 MENU_ID) 와 모순.
                    //   화면이 그룹 폴더에 매달려야 트리 표시 + FULL_SEQ 그룹BASE 산출이 가능하다.
                    //   → FE 가 제공한 그룹 폴더 PARENT_MENU_ID(트리 노드 / OBJECT LoV 선택값) 를 보존.
                    //
                    // 2026-09-04 — blank 일 때의 As-Is fallback(self) 을 제거하고 거부로 바꿨다 (TE-006).
                    //   그 fallback 은 "보호" 가 아니라 복구 불가능한 행을 만들어 냈다:
                    //     · 자기참조 행은 트리 어느 폴더에도 안 걸려 searchCmMenu 결과에서 사라진다
                    //       (PARENT_MENU_ID IN (후손 폴더) 에 자기 자신은 없다).
                    //     · componentPath 가 "{자기ID}/{objectId}" 로 조립돼 page-registry 키와 어긋나 화면도 안 열린다.
                    //     · OBJECT LoV 는 부모를 SEC_MENU 에서 역조회하므로 깨진 값을 계속 되읽는다.
                    //     · 상세 폼의 상위 폴더는 readOnly 이고 메인 그리드엔 그 컬럼이 없어 화면에서 못 고친다.
                    //   즉 한 번 blank 로 저장되면 DB 를 직접 건드리지 않는 한 빠져나올 수 없었다.
                    //   R3 이후 화면 leaf 의 부모는 반드시 그룹 폴더이므로 자기참조는 성립할 수 없는 값이다.
                    String rowParentMenuId = strOf(row.get("PARENT_MENU_ID"));
                    if (rowParentMenuId == null || rowParentMenuId.isBlank()) {
                        throw new BusinessException(ErrorCode.REQUIRED_VALUE,
                                "상위 폴더가 지정되지 않았습니다 (MENU_ID=" + menuId + "). "
                                        + "좌측 메뉴 구조 트리에서 그룹 폴더를 먼저 선택한 뒤 행을 추가하세요.");
                    }
                    entity.setParentMenuId(rowParentMenuId);
                    entity.setMenuParam1(strOf(row.get("MENU_PARAM1")));
                    entity.setMenuParam2(strOf(row.get("MENU_PARAM2")));
                    entity.setMenuParam3(strOf(row.get("MENU_PARAM3")));
                    secMenuRepository.save(entity);
                    cnt++;
                } else {
                    log.warn("[commMenuMng.saveCmMenu] unknown status={} — skip", status);
                }
            }
        }
        // 2026-06-04 사용자 지시 — FULL_SEQ 7자리 인코딩 자동 부여 (화면 + 폴더 트리 전체 멱등 재계산).
        // CRUD 직후 · 재조회 직전에 호출 → ds_menuList 가 항상 최신 FULL_SEQ 반영.
        secMenuNativeRepository.recomputeMenuFullSeq();

        // 저장 후 후속 search 재조회 (As-Is fn_callBack saveCmMenu → fn_search 자동 재호출 정합)
        List<Map<String, Object>> rows = secMenuNativeRepository.searchCmMenu(null, null, null, null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_menuList", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchObj — 선택 메뉴의 OBJECT 정보 조회
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchObj} 진입점. As-Is {@code selectMenuObj} (xml:142~154) 호출 — TB_MCM_SEC_OBJ
     * WHERE OBJECT_ID=#{} 단건 검색.
     *
     * <p>As-Is GO-NNN 그리드 데이터 (As-Is 9 컬럼 → To-Be 8 컬럼, 정책 #1 BIZ_SYSTEM_CODE 제거).
     *
     * <p>응답: {@code ds_objMng} (As-Is dataset 이름 보존).
     */
    public Map<String, Object> searchObj(CommMenuMngSearchObjRequest request) {
        String objectId = request != null ? request.getOBJECT_ID() : null;
        List<Map<String, Object>> rows = (objectId == null || objectId.isBlank())
                ? new ArrayList<>()
                : secMenuNativeRepository.searchObj(objectId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_objMng", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: commonList — OBJECT 팝업 LoV (P-001 commonDynamic.xfdl)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code commonList} 진입점. As-Is {@code selectMenuObjPop} (xml:156~168) 호출 —
     * TB_MCM_SEC_OBJ WHERE USE_TP='Y' AND (UPPER OBJECT_ID LIKE OR UPPER OBJECT_NM LIKE).
     *
     * <p>응답: {@code ds_menuObjLst} (As-Is dataset 이름 보존 — commonDynamic.xfdl LoV 의 13번째 파라미터).
     */
    public Map<String, Object> commonList(CommMenuMngCommonListRequest request) {
        String edtObjectId = request != null ? request.getEdtOBJECTID() : null;
        List<Map<String, Object>> rows = secMenuNativeRepository.searchMenuObjPop(edtObjectId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuObjLst", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmMenuFld / saveCmMenuFld — 2026-06-04 사용자 지시
    //   "메뉴 필드 관리" 팝업 (그리드 batch CRUD)
    // ────────────────────────────────────────────────────────────────

    /**
     * 메뉴 필드 목록 조회 — TB_MCM_SEC_MENU_FLD 4 컬럼 + FULL_SEQ + MENU_VIEW_YN 그리드 표시용.
     * 응답: {@code ds_menuFldList} (As-Is dataset 명 정합).
     */
    public Map<String, Object> searchCmMenuFld() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuFldList", menuFldRowsWithViewYn());
        return out;
    }

    /**
     * 메뉴 필드 그리드 응답 조립 — {@code searchMenuFldList()} 결과
     * (MENU_ID/MENU_SEQ/MENU_NM/PARENT_MENU_ID/FULL_SEQ/MENU_VIEW_YN) 의 표시값만 정규화한다.
     *
     * <p><b>NULL = 표시</b> — 현 시드의 mcm 계열 폴더는 MENU_VIEW_YN 이 NULL 이고, 사이드바 필터
     * ({@code SecUserService}) 도 {@code 'N'} 일 때만 숨기므로 NULL 의 실동작은 "표시" 다.
     * 그리드에 빈칸으로 내려가면 운영자가 "미설정=숨김?" 으로 오해하므로 응답 시점에 {@code 'Y'} 로 승격한다.
     * <b>DB 는 갱신하지 않는다</b> (시드 담당 영역) — 표시용 정규화만 수행.
     *
     * <p>2026-08-14 — 컬럼 read 는 모듈 공용 {@code SecMenuNativeRepository} 로 흡수됐다
     * (구 화면 전용 어댑터 폐기). 본 메서드에는 표시 정규화만 남는다.
     */
    private List<Map<String, Object>> menuFldRowsWithViewYn() {
        List<Map<String, Object>> rows = secMenuNativeRepository.searchMenuFldList();
        for (Map<String, Object> row : rows) {
            row.put("MENU_VIEW_YN", normalizeViewYn(row.get("MENU_VIEW_YN")));
        }
        return rows;
    }

    /**
     * 메뉴 필드 일괄 저장 — rowStatus 분기 (cma masterCategoryMng / commMenuMng saveCmMenu 정본 패턴).
     *
     * <p>grids.master.rows → BPMN method param name "master" 자동 매핑 (가이드 §6-E-3).
     * <ul>
     *   <li>"inserted" / "I" → INSERT (PK 충돌 시 IllegalStateException — 상위 catch 가 FE 로 메시지 노출)</li>
     *   <li>"updated"  / "U" → UPDATE WHERE MENU_ID=#{}</li>
     *   <li>"deleted"  / "D" → DELETE WHERE MENU_ID=#{} (자식 존재 시 IllegalStateException 거부)</li>
     *   <li>그 외 (변경 없음) → skip</li>
     * </ul>
     *
     * <p>2026-08-13 — 폴더 표시/미표시({@code MENU_VIEW_YN}) 추가.
     * 2026-08-14 — 후속 UPDATE 방식을 폐기하고 {@code insertMenuFld}/{@code updateMenuFld} SQL 자체가
     * 본 컬럼을 다루도록 공용 repository 로 흡수했다 (같은 문장 = 같은 트랜잭션, 왕복 1회).
     * <ul>
     *   <li>INSERT — 항상 정규화 값을 적재 (키 없어도 {@code 'Y'} → 컬럼에 NULL 이 남지 않는다).</li>
     *   <li>UPDATE — row 에 {@code MENU_VIEW_YN} 키가 <b>없으면 null 을 넘겨 DB 값을 보존</b>한다
     *       (구 FE·타 호출부가 기본값 {@code 'Y'} 로 운영자의 {@code 'N'} 설정을 되돌리는 사고 방지).</li>
     * </ul>
     */
    public Map<String, Object> saveCmMenuFld(List<Map<String, Object>> master) {
        int cntInsert = 0, cntUpdate = 0, cntDelete = 0, cntSkip = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                String status = strOf(row.get("nativeeditor_status"));
                String menuId = strOf(row.get("MENU_ID"));
                String menuSeq = strOf(row.get("MENU_SEQ"));
                String menuNm = strOf(row.get("MENU_NM"));
                String parentMenuId = strOf(row.get("PARENT_MENU_ID"));
                if (menuId == null || menuId.isBlank()) {
                    log.warn("[commMenuMng.saveCmMenuFld] PK (MENU_ID) null — skip row (status={})", status);
                    cntSkip++;
                    continue;
                }
                if ("inserted".equals(status) || "I".equals(status)) {
                    if (menuSeq == null || menuSeq.isBlank()) throw new IllegalArgumentException("MENU_SEQ 는 필수입니다 (MENU_ID=" + menuId + ")");
                    if (menuNm == null || menuNm.isBlank()) throw new IllegalArgumentException("MENU_NM 은 필수입니다 (MENU_ID=" + menuId + ")");
                    try {
                        // MENU_SEQ '0' LPAD 8자리 (2026-06-05 사용자 지시). FLD 는 PK=MENU_ID 라 안전.
                        // 표시/미표시 — 신규 행은 키가 없어도 'Y' 로 확정해 NULL 이 남지 않게 한다.
                        secMenuNativeRepository.insertMenuFld(
                                menuId, lpad8(menuSeq), menuNm, parentMenuId,
                                normalizeViewYn(row.get("MENU_VIEW_YN")));
                        cntInsert++;
                    } catch (RuntimeException e) {
                        throw new IllegalStateException("MENU_ID='" + menuId + "' INSERT 실패: " + e.getMessage(), e);
                    }
                } else if ("updated".equals(status) || "U".equals(status)) {
                    if (menuSeq == null || menuSeq.isBlank()) throw new IllegalArgumentException("MENU_SEQ 는 필수입니다 (MENU_ID=" + menuId + ")");
                    if (menuNm == null || menuNm.isBlank()) throw new IllegalArgumentException("MENU_NM 은 필수입니다 (MENU_ID=" + menuId + ")");
                    // 표시/미표시 — 키가 실려 온 경우에만 값을 넘긴다. null = SET 절 제외 = DB 값 보존.
                    String viewYn = row.containsKey("MENU_VIEW_YN")
                            ? normalizeViewYn(row.get("MENU_VIEW_YN")) : null;
                    int updated = secMenuNativeRepository.updateMenuFld(
                            menuId, lpad8(menuSeq), menuNm, parentMenuId, viewYn);
                    if (updated == 0) log.warn("[commMenuMng.saveCmMenuFld] UPDATE skipped — MENU_ID={} 미존재", menuId);
                    cntUpdate += updated;
                } else if ("deleted".equals(status) || "D".equals(status)) {
                    int deleted = secMenuNativeRepository.deleteMenuFld(menuId);
                    cntDelete += deleted;
                } else {
                    cntSkip++;
                }
            }
        }
        log.info("[commMenuMng.saveCmMenuFld] batch insert={} update={} delete={} skip={}", cntInsert, cntUpdate, cntDelete, cntSkip);
        // 2026-06-04 사용자 지시 — 폴더(메뉴 필드) FULL_SEQ 자동 부여 (모듈 백만 / 그룹 만). 화면 FULL_SEQ 도 동시 정합.
        secMenuNativeRepository.recomputeMenuFullSeq();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_insert", cntInsert);
        out.put("cnt_update", cntUpdate);
        out.put("cnt_delete", cntDelete);
        // 후속 재조회 (저장 직후 그리드 + 트리 동시 갱신) — searchMenuFldList 가 FULL_SEQ 동봉,
        // menuFldRowsWithViewYn 이 MENU_VIEW_YN 을 덧입힌다.
        out.put("ds_menuFldList", menuFldRowsWithViewYn());
        return out;
    }

    /**
     * {@code MENU_VIEW_YN} 값 정규화 — {@code 'N'}(대소문자 무관) 만 미표시, 그 외(NULL / 빈 문자열 /
     * 이상값 / {@code 'Y'})는 모두 {@code 'Y'}(표시).
     *
     * <p>VARCHAR(1) 코드 컬럼에 {@code ''} 가 들어가면 Hibernate Character 변환에서 CoercionException 이
     * 발생해 화면이 통째로 죽는 전례가 있다 (DataInitializer {@code normalizeSecMenuCharColumns} 주석).
     * 저장 경로에서 빈 문자열이 절대 통과하지 못하도록 여기서 차단한다.
     */
    private static String normalizeViewYn(Object v) {
        if (v == null) return "Y";
        String s = String.valueOf(v).trim();
        return "N".equalsIgnoreCase(s) ? "N" : "Y";
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * MENU_SEQ '0' LPAD 8자리 (2026-06-05 사용자 지시 — 예: "12" → "00000012").
     * <p>null → null / 빈 값 · 이미 8자 이상 → trim 후 그대로 (truncate ✗). 숫자 검증은 FE 가 담당.
     */
    private static String lpad8(String s) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty() || t.length() >= 8) return t;
        return "00000000".substring(t.length()) + t;
    }

    /**
     * Map row 의 date 값 → {@link LocalDateTime} 변환 (cma / W1 정본 패턴).
     * 지원 입력 type: {@link LocalDateTime} 직접 / {@link String} "yyyy-MM-dd[ HH:mm:ss]" / "yyyyMMdd" 8자
     * (As-Is xfdl:691/721 default "99991231") / null → fallback.
     */
    private static LocalDateTime parseLocalDateTime(Object v, LocalDateTime fallback) {
        if (v == null) return fallback;
        if (v instanceof LocalDateTime ldt) return ldt;
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equals(s)) return fallback;
        try {
            if (s.length() == 8 && s.matches("\\d{8}")) {
                // "yyyyMMdd" → 자정 (As-Is V-004 millisecond cut 정합)
                return LocalDateTime.parse(
                        s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8) + "T00:00:00");
            }
            if (s.length() == 10) {
                return LocalDateTime.parse(s + "T00:00:00");
            }
            if (s.contains(" ")) {
                return LocalDateTime.parse(s.replace(' ', 'T'));
            }
            return LocalDateTime.parse(s);
        } catch (Exception e) {
            log.warn("[commMenuMng.parseLocalDateTime] parse failed value={} — fallback", s);
            return fallback;
        }
    }
}
