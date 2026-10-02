/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: noticeMgmt (공지사항 관리) OASIS 서비스 — search / save / changeStatus 3 action
 * 수정: 2026-10-02 — 본문 형식(CONTENT_FORMAT)·공지 분류(NOTICE_CATEGORY)·상단 고정(PIN_YN) 추가, HTML 소독, 본문 상한 4000자 → 20만 자
 * 수정: 2026-10-02 — 게시 대상(TARGET_SCOPE ALL/ROLE + TB_MLS_NOTICE_TARGET 역할 목록) 추가
 * 수정: 2026-10-03 — save 에 MDM 저장 검증(MdmValidator.check, TITLE) 연결 — 컬럼 사전 정의로 값을 한 번 더 본다
 */
package com.dongkuk.dmes.mls.lsh.noticeMgmt.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.mdm.MdmValidationRequest;
import com.dongkuk.dmes.cactus.mdm.MdmValidator;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mls.entity.Notice;
import com.dongkuk.dmes.mls.entity.NoticeTarget;
import com.dongkuk.dmes.mls.lsh.common.NoticeCodes;
import com.dongkuk.dmes.mls.lsh.common.NoticeHtmlSanitizer;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.dto.NoticeMgmtChangeStatusRequest;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.dto.NoticeMgmtSearchRequest;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import com.dongkuk.dmes.mls.repository.NoticeTargetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * 공지사항 관리 ({@code noticeMgmt}) OASIS 진입 서비스.
 *
 * <p>정본: {@code docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md}.
 * 본 화면은 <b>As-Is 레거시가 없는 To-Be only 신규 화면</b>이라 분석리포트 인용이 없다
 * (기능설계서 §11.1 GAP-001).
 *
 * <p>BPMN {@code services/lsh/noticeMgmt.bpmn} 의 {@code actionGateway} 3 분기와 1:1 이다.
 * <ul>
 *   <li>{@code search}       → {@link #search(NoticeMgmtSearchRequest)} — §3 조회조건 S-001~S-006</li>
 *   <li>{@code save}         → {@link #save(List)} — §5.1 B-003 저장 / B-004 삭제 (rowStatus C/U/D)</li>
 *   <li>{@code changeStatus} → {@link #changeStatus(NoticeMgmtChangeStatusRequest)} — §5.1 B-005 게시중지</li>
 * </ul>
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다 (MUST).</b> 붙이면 Spring 이 CGLIB proxy 를 만들고
 * proxy 메서드에는 {@code -parameters} 가 심는 {@code MethodParameters} 속성이 없어 OASIS 의
 * 파라미터명 바인딩이 {@code IllegalArgumentException: ParameterName must not be null} 로 죽는다
 * (BackEnd 표준 §6-B-1). 트랜잭션은 {@code SpringTransactionHandler} 가 BPMN process 단위로 감싸며
 * default manager {@code txBiz} 가 자동 주입된다 — 본 클래스의 save 전체가 이미 한 트랜잭션이다.
 *
 * <p><b>반환은 {@code Map<String,Object>} + BPMN {@code output="result"}</b> 조합이다.
 * cactus 는 Map 내부의 List 를 자동 분리하지 않으므로 FE 가 {@code data.result} 를 flat 전개한다
 * (BackEnd 표준 §6-D-2). 조회 결과와 처리 건수를 한 번에 돌려주려면 이 방식이 필요하다.
 */
@Service("noticeMgmtService")
public class NoticeMgmtService {

    private static final Logger log = LoggerFactory.getLogger(NoticeMgmtService.class);

    // LV-001~LV-003 코드값은 noticeBoard 와 같이 쓰므로 NoticeCodes 한 곳에 둔다 (기능설계서 §10).
    private static final String STATUS_DRAFT = NoticeCodes.STATUS_DRAFT;
    private static final String STATUS_POSTED = NoticeCodes.STATUS_POSTED;
    private static final String STATUS_STOPPED = NoticeCodes.STATUS_STOPPED;

    /** 채번 prefix 포맷 — {@code NT} + {@code yyyyMMdd}. 일자별 4자리 순번이 뒤에 붙는다. */
    private static final DateTimeFormatter ID_DATE = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.KOREA);

    /** 저장 body 최상위 grid 키 (기능설계서 §1.3 기본값 채택). {@code errors[].grid} 값과 동일해야 한다. */
    private static final String GRID_MASTER = "master";

    /** V-003 내용 최대 길이 (2026-10-02 — 4000자 제한을 풀면서 서버 상한을 20만 자로 둔다). */
    static final int CONTENT_MAX_LENGTH = 200_000;

    /** 대상 역할 ID 형식 — mcm TB_MCM_SEC_ROLE.ROLE_ID 관례(영문 대문자·숫자·밑줄). 존재 여부는 다른 DB 라 확인할 수 없다. */
    private static final Pattern ROLE_ID_PATTERN = Pattern.compile("^[A-Z0-9_]{1,100}$");

    /**
     * MDM 컬럼 사전으로 검사할 컬럼 — DB 칸(TB_MLS_NOTICE)과 MDM 정의를 견주어 <b>MDM 이 DB 보다 엄격하지 않은 칸만</b> 넣는다
     * (spec 2026-10-03-mdm-screen-meta-validation §7). MDM 이 더 엄격하면 DB 가 받는 값을 저장 단계에서 막게 된다.
     * <ul>
     *   <li>{@code TITLE} — MDM STRING(1000)·선택, DB VARCHAR(200)·NOT NULL. MDM 이 느슨하다 → 넣는다.
     *       (200자·필수는 {@link #validateRow} 가 계속 본다.)</li>
     *   <li>{@code NOTICE_CATEGORY} 등 나머지 — 컬럼 사전에 같은 물리명이 없다({@code CATEGORY} 는 다른 이름이라 맞지 않는다,
     *       별칭 매칭은 후속). 코드 값은 {@link #validateRow} 가 본다.</li>
     * </ul>
     */
    private static final String[] MDM_COLUMNS = {"TITLE"};

    private final NoticeRepository noticeRepository;
    private final NoticeTargetRepository noticeTargetRepository;
    /** {@code cactus.mdm.enabled=false} 면 빈이 없다 — 그때는 MDM 검증 없이 저장한다. */
    private final ObjectProvider<MdmValidator> mdmValidator;

    public NoticeMgmtService(NoticeRepository noticeRepository, NoticeTargetRepository noticeTargetRepository,
                             ObjectProvider<MdmValidator> mdmValidator) {
        this.noticeRepository = noticeRepository;
        this.noticeTargetRepository = noticeTargetRepository;
        this.mdmValidator = mdmValidator;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search
    // ────────────────────────────────────────────────────────────────

    /**
     * 공지사항 목록 조회 (기능설계서 §3 / B-001).
     *
     * <p>S-005 공지 분류·S-006 본문 형식은 빈 값이면 전체이고, 값이 있으면 허용 코드(LV-002·LV-003)인지 먼저 본다.
     * 허용 밖 값을 조용히 0건으로 돌려주면 화면 오타가 "공지 없음" 으로 보이므로 오류로 알린다.
     *
     * @param request S-001~S-006. null 이면 전건 조회 (화면 최초 진입 시 FE 가 빈 봉투를 보낸다).
     * @return {@code {"list": [...]}} — BPMN {@code output="result"} 로 {@code data.result.list} 에 실린다.
     */
    public Map<String, Object> search(NoticeMgmtSearchRequest request) {
        String title = request != null ? request.getTitle() : null;
        String status = request != null ? request.getNoticeStatus() : null;
        LocalDate fromDt = parseDate(request != null ? request.getPostStartDt() : null);
        LocalDate toDt = parseDate(request != null ? request.getPostEndDt() : null);
        String category = searchCode(request != null ? request.getNoticeCategory() : null,
                NoticeCodes.CATEGORY_DOMAIN, "공지 분류");
        String format = searchCode(request != null ? request.getContentFormat() : null,
                NoticeCodes.FORMAT_DOMAIN, "본문 형식");

        List<Notice> rows = noticeRepository.searchByFilter(title, status, fromDt, toDt, category, format);
        log.info("[noticeMgmt] search — title={} status={} from={} to={} category={} format={} rows={}",
                title, status, fromDt, toDt, category, format, rows.size());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", toRows(rows));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save
    // ────────────────────────────────────────────────────────────────

    /**
     * 공지사항 일괄 저장 (기능설계서 §5.1 B-003 / B-004).
     *
     * <p>파라미터 이름 {@code master} 는 요청 봉투의 {@code grids.master.rows} 키와 <b>글자 단위로 일치</b>해야
     * 한다 — OASIS {@code ParameterNameMethodArgumentBindingStrategy} 가 이름으로 바인딩한다
     * (BackEnd 표준 §6-E-3). 이름을 바꾸면 조용히 null 이 들어온다.
     *
     * <p>rowStatus 분기: {@code C}(inserted) / {@code U}(updated) / {@code D}(deleted). 그 외(미변경)는 skip.
     * FE shared 그리드는 {@code inserted/updated/deleted} 문자열도 쓰므로 양쪽을 모두 받는다.
     *
     * <p>검증은 <b>전 행을 먼저 돌고 마지막에 한 번 throw</b> 한다. 첫 오류에서 바로 던지면 사용자가
     * 오류를 하나씩 고치며 저장을 반복해야 한다. 수집한 {@link ErrorDetail} 은 Level B 응답의
     * {@code errors[]} 로 내려가 화면이 행·필드 단위로 표시한다.
     *
     * @return {@code {"cntMerge": n, "savedIds": [...], "list": [...]}} — 처리 건수 + 저장(C/U)한 공지번호(입력 행 순서, 신규는
     *         서버 채번값. 삭제·미변경 행은 빠진다) + 재조회 결과 (§5.2 B-003 4단계). 2026-10-02 savedIds 추가 — 신규 저장 뒤
     *         화면이 새 NOTICE_ID 로 행을 다시 고를 수 있게 한다.
     */
    public Map<String, Object> save(List<Map<String, Object>> master) {
        int cntInsert = 0;
        int cntUpdate = 0;
        int cntDelete = 0;
        // MDM 저장 검증 — 쓰기 전에 먼저 본다. 값 오류가 있으면 errors 에 미리 담겨 아래 반복이 아무것도 쓰지 않고(errors 가 비어야
        // 쓴다) 수작업 검증 오류와 한 응답으로 내려간다. 검증 불가(MDM_UNAVAILABLE)는 여기서 그대로 던진다.
        List<ErrorDetail> errors = new ArrayList<>(mdmValueErrors(master));
        List<String> savedIds = new ArrayList<>();

        if (master != null) {
            for (int i = 0; i < master.size(); i++) {
                Map<String, Object> row = master.get(i);
                if (row == null) {
                    continue;
                }
                String rowStatus = normalizeRowStatus(str(row.get("rowStatus")));
                String noticeId = str(row.get("NOTICE_ID"));

                switch (rowStatus) {
                    case "C" -> {
                        validateRow(row, i, noticeId, null, errors);
                        if (errors.isEmpty()) {
                            savedIds.add(insertRow(row));
                            cntInsert++;
                        }
                    }
                    case "U" -> {
                        if (isBlank(noticeId)) {
                            errors.add(ErrorDetail.ofGrid(GRID_MASTER, noticeId, i, "NOTICE_ID",
                                    ErrorCode.REQUIRED_VALUE.getCode(), "수정 대상 공지번호가 없습니다."));
                            continue;
                        }
                        validateRow(row, i, noticeId, noticeId, errors);
                        if (errors.isEmpty()) {
                            updateRow(noticeId, row, i);
                            savedIds.add(noticeId);
                            cntUpdate++;
                        }
                    }
                    case "D" -> {
                        if (isBlank(noticeId)) {
                            continue; // 저장 전에 추가했다가 지운 임시 행 — 서버가 할 일이 없다.
                        }
                        deleteRow(noticeId, i, errors);
                        if (errors.isEmpty()) {
                            cntDelete++;
                        }
                    }
                    default -> { /* 미변경 행 — skip */ }
                }
            }
        }

        if (!errors.isEmpty()) {
            // 한 건이라도 실패하면 전체 롤백한다 (BPMN process 단위 트랜잭션).
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "입력값을 확인해주세요.", errors);
        }

        int cnt = cntInsert + cntUpdate + cntDelete;
        log.info("[noticeMgmt] save — insert={} update={} delete={}", cntInsert, cntUpdate, cntDelete);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cntMerge", cnt);
        out.put("savedIds", savedIds);
        out.put("list", toRows(noticeRepository.searchAll()));
        return out;
    }

    /**
     * 저장할 행(C·U)을 MDM 컬럼 사전({@link #MDM_COLUMNS})으로 검사한다 — {@link MdmValidator#check}.
     *
     * <p>검증기는 {@code rowIndex} 를 요청 목록의 자리로 센다. 오류가 화면의 그 행에 붙도록 목록 길이·자리는 {@code master} 와 같게 두고,
     * 저장하지 않을 행(삭제·미변경·null)은 {@code rowStatus=D} 만 담은 자리 채움 행으로 바꿔 검증기가 건너뛰게 한다(미변경 행의 옛 값이
     * 지금 저장과 무관하게 막으면 안 된다).
     *
     * @return MDM 값 오류. 검증기가 없거나 저장할 행이 없으면 빈 목록. 검증 불가(BUSINESS_ERROR)는 던진다
     */
    private List<ErrorDetail> mdmValueErrors(List<Map<String, Object>> master) {
        MdmValidator validator = mdmValidator.getIfAvailable();
        if (validator == null || master == null) {
            return List.of();
        }
        List<Map<String, Object>> rows = new ArrayList<>(master.size());
        boolean any = false;
        for (Map<String, Object> row : master) {
            String status = row == null ? "" : normalizeRowStatus(str(row.get("rowStatus")));
            if ("C".equals(status) || "U".equals(status)) {
                rows.add(row);
                any = true;
            } else {
                rows.add(Map.of("rowStatus", "D"));
            }
        }
        if (!any) {
            return List.of();
        }
        try {
            validator.check(MdmValidationRequest.rows(GRID_MASTER, rows).columns(MDM_COLUMNS).build());
            return List.of();
        } catch (BusinessException e) {
            if (e.getErrorCode() == ErrorCode.INVALID_VALUE && e.getErrors() != null) {
                return e.getErrors(); // 값 오류 — 수작업 검증 오류와 합쳐 한 번에 내려보낸다
            }
            throw e; // MDM_UNAVAILABLE 등 — 그대로
        }
    }

    // ────────────────────────────────────────────────────────────────
    // action: changeStatus
    // ────────────────────────────────────────────────────────────────

    /**
     * 게시상태 변경 (기능설계서 §5.1 B-005 / §7.2 전이 규칙).
     *
     * <p>클라이언트가 보낸 현재 상태를 믿지 않고 <b>DB 를 다시 읽어</b> 전이 가능 여부를 판정한다
     * (Mes-Guide §7). 화면에서 목록을 띄워둔 사이 다른 사용자가 상태를 바꿨을 수 있다.
     */
    public Map<String, Object> changeStatus(NoticeMgmtChangeStatusRequest request) {
        if (request == null || isBlank(request.getNoticeId())) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "공지번호가 없습니다.");
        }
        String target = request.getNoticeStatus();
        if (!NoticeCodes.STATUS_DOMAIN.contains(target)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "게시상태 값이 올바르지 않습니다.");
        }

        Notice entity = noticeRepository.findById(request.getNoticeId())
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "대상 공지를 찾을 수 없습니다."));

        String current = entity.getNoticeStatus();
        if (!isTransitionAllowed(current, target)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "허용되지 않는 상태 전이입니다. (" + current + " → " + target + ")");
        }
        if (STATUS_POSTED.equals(target) && (entity.getPostStartDt() == null || entity.getPostEndDt() == null)) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "게시중으로 변경하려면 게시기간을 입력하세요.");
        }

        entity.setNoticeStatus(target);
        noticeRepository.save(entity);
        log.info("[noticeMgmt] changeStatus — noticeId={} {} -> {}", entity.getNoticeId(), current, target);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cntMerge", 1);
        out.put("list", toRows(noticeRepository.searchAll()));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // 내부 구현
    // ────────────────────────────────────────────────────────────────

    /** §7.2 상태 전이 규칙. 같은 상태로의 전이는 no-op 로 허용한다. */
    private boolean isTransitionAllowed(String from, String to) {
        if (to.equals(from)) {
            return true;
        }
        return switch (from == null ? STATUS_DRAFT : from) {
            case STATUS_DRAFT -> STATUS_POSTED.equals(to);
            case STATUS_POSTED -> STATUS_STOPPED.equals(to);
            case STATUS_STOPPED -> STATUS_POSTED.equals(to);
            default -> false;
        };
    }

    /**
     * V-001·V-002·V-004~V-007 + XV-001~XV-002 서버 재검증 (기능설계서 §6).
     *
     * <p>V-003(내용 길이)은 2026-10-02 에 4000자 → 20만 자로 바꿨다(DB 컬럼 길이가 아니라 서버 검증). V-005~V-007 은 키가 있고 값이 비어 있지 않을 때만 본다 —
     * 빈 값·키 없음은 {@link #applyRow} 가 기본값·기존값으로 처리한다.
     */
    private void validateRow(Map<String, Object> row, int idx, String rowKey, String storedNoticeId,
                             List<ErrorDetail> errors) {
        String title = str(row.get("TITLE"));
        String content = str(row.get("CONTENT"));
        String status = str(row.get("NOTICE_STATUS"));
        LocalDate from = parseDate(str(row.get("POST_START_DT")));
        LocalDate to = parseDate(str(row.get("POST_END_DT")));

        if (isBlank(title)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "TITLE",
                    ErrorCode.REQUIRED_VALUE.getCode(), "제목은 필수입니다."));            // V-001
        } else if (title.length() > 200) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "TITLE",
                    ErrorCode.INVALID_VALUE.getCode(), "제목은 200자를 넘을 수 없습니다."));  // V-002
        }
        if (content != null && content.length() > CONTENT_MAX_LENGTH) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "CONTENT",
                    ErrorCode.INVALID_VALUE.getCode(), "내용은 200,000자를 넘을 수 없습니다."));             // V-003
        }
        if (isBlank(status) || !NoticeCodes.STATUS_DOMAIN.contains(status)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "NOTICE_STATUS",
                    ErrorCode.REQUIRED_VALUE.getCode(), "게시상태를 선택하세요."));           // V-004
        }
        if (!isAllowedOrBlank(row.get("CONTENT_FORMAT"), NoticeCodes.FORMAT_DOMAIN)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "CONTENT_FORMAT",
                    ErrorCode.INVALID_VALUE.getCode(), "본문 형식은 TEXT·MD·HTML 중 하나여야 합니다."));      // V-005
        }
        if (!isAllowedOrBlank(row.get("NOTICE_CATEGORY"), NoticeCodes.CATEGORY_DOMAIN)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "NOTICE_CATEGORY",
                    ErrorCode.INVALID_VALUE.getCode(), "공지 분류는 NORMAL·MAINT·URGENT 중 하나여야 합니다.")); // V-006
        }
        if (!isAllowedOrBlank(yn(row.get("PIN_YN")), NoticeCodes.YN_DOMAIN)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "PIN_YN",
                    ErrorCode.INVALID_VALUE.getCode(), "상단 고정은 Y 또는 N 이어야 합니다."));              // V-007
        }
        validateTargets(row, idx, rowKey, storedNoticeId, errors);                                     // V-008~V-010
        if (from != null && to != null && from.isAfter(to)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "POST_START_DT",
                    ErrorCode.INVALID_VALUE.getCode(),
                    "게시시작일은 게시종료일보다 늦을 수 없습니다."));                          // XV-001
        }
        if (STATUS_POSTED.equals(status) && (from == null || to == null)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "POST_START_DT",
                    ErrorCode.REQUIRED_VALUE.getCode(),
                    "게시중으로 변경하려면 게시기간을 입력하세요."));                            // XV-002
        }
    }

    /** @return 채번한 공지번호 */
    private String insertRow(Map<String, Object> row) {
        Notice entity = new Notice(nextNoticeId());
        applyRow(entity, row);
        noticeRepository.save(entity);
        syncTargets(entity, row);
        return entity.getNoticeId();
    }

    private void updateRow(String noticeId, Map<String, Object> row, int idx) {
        Notice entity = noticeRepository.findById(noticeId).orElseThrow(() ->
                new BusinessException(ErrorCode.INVALID_VALUE, "수정 대상 공지가 없습니다: " + noticeId,
                        List.of(ErrorDetail.ofGrid(GRID_MASTER, noticeId, idx, "NOTICE_ID",
                                ErrorCode.INVALID_VALUE.getCode(), "수정 대상 공지가 없습니다."))));
        applyRow(entity, row);
        noticeRepository.save(entity);
        syncTargets(entity, row);
    }

    /** §7.1 — 게시중(POSTED) 건은 삭제할 수 없다. DB 값을 다시 읽어 판정한다. */
    private void deleteRow(String noticeId, int idx, List<ErrorDetail> errors) {
        Notice entity = noticeRepository.findById(noticeId).orElse(null);
        if (entity == null) {
            return; // 이미 지워진 행 — 멱등 처리
        }
        if (STATUS_POSTED.equals(entity.getNoticeStatus())) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, noticeId, idx, "NOTICE_STATUS",
                    ErrorCode.BUSINESS_ERROR.getCode(),
                    "게시중인 공지는 삭제할 수 없습니다. 게시중지 후 삭제하세요."));
            return;
        }
        noticeTargetRepository.deleteAll(noticeTargetRepository.findByNoticeIds(List.of(noticeId)));
        noticeRepository.delete(entity);
    }

    /**
     * 화면 행 → 엔티티.
     *
     * <p>V3 세 컬럼({@code CONTENT_FORMAT}·{@code NOTICE_CATEGORY}·{@code PIN_YN})은 <b>키가 없으면 저장된 값을 그대로 둔다</b>.
     * 세 컬럼을 모르는 이전 화면이 수정(U) 행을 보내도 MD·HTML 공지가 TEXT 로 돌아가거나 고정이 풀리지 않게 하려는 것이다.
     * 키가 있는데 값이 비어 있으면 기본값(TEXT·NORMAL·N)으로 둔다. 신규(C) 엔티티는 필드 초기값이 이미 기본값이다.
     *
     * <p>본문 형식이 최종적으로 HTML 이면 본문을 {@link NoticeHtmlSanitizer} 로 소독해서 저장한다. 형식 키가 없어 저장된
     * 형식(HTML)을 이어받는 경우도 소독한다.
     */
    private void applyRow(Notice entity, Map<String, Object> row) {
        entity.setTitle(str(row.get("TITLE")));
        String status = str(row.get("NOTICE_STATUS"));
        entity.setNoticeStatus(isBlank(status) ? STATUS_DRAFT : status);
        entity.setPostStartDt(parseDate(str(row.get("POST_START_DT"))));
        entity.setPostEndDt(parseDate(str(row.get("POST_END_DT"))));

        if (row.containsKey("CONTENT_FORMAT")) {
            entity.setContentFormat(codeOrDefault(row.get("CONTENT_FORMAT"), NoticeCodes.FORMAT_TEXT));
        }
        if (row.containsKey("NOTICE_CATEGORY")) {
            entity.setNoticeCategory(codeOrDefault(row.get("NOTICE_CATEGORY"), NoticeCodes.CATEGORY_NORMAL));
        }
        if (row.containsKey("PIN_YN")) {
            entity.setPinYn(codeOrDefault(yn(row.get("PIN_YN")), NoticeCodes.NO));
        }
        if (row.containsKey("TARGET_SCOPE")) {
            entity.setTargetScope(codeOrDefault(row.get("TARGET_SCOPE"), NoticeCodes.SCOPE_ALL));
        }

        String content = str(row.get("CONTENT"));
        entity.setContent(NoticeCodes.FORMAT_HTML.equals(entity.getContentFormat())
                ? NoticeHtmlSanitizer.sanitize(content)
                : content);
    }

    /**
     * 채번 — {@code NT + yyyyMMdd + 4자리 순번}.
     *
     * <p>DB 의 같은 날짜 마지막 값 +1 이다. 단일 인스턴스·단일 트랜잭션 전제이며, 다중 인스턴스로 가면
     * 시퀀스나 채번 테이블로 바꿔야 한다 (본 화면은 테스트 모듈이라 여기까지 두었다).
     */
    private String nextNoticeId() {
        String prefix = "NT" + LocalDate.now().format(ID_DATE);
        String last = noticeRepository.findLastNoticeIdByPrefix(prefix);
        int seq = 1;
        if (last != null && last.length() == prefix.length() + 4) {
            try {
                seq = Integer.parseInt(last.substring(prefix.length())) + 1;
            } catch (NumberFormatException e) {
                log.warn("[noticeMgmt] 채번 파싱 실패 — last={} (1 부터 재시작)", last);
            }
        }
        return prefix + String.format("%04d", seq);
    }

    /** Entity → 화면 행 (기능설계서 §3.2 G-001~G-010 + §4 D-003 내용). 대상 역할은 한 번의 조회로 붙인다. */
    private List<Map<String, Object>> toRows(List<Notice> rows) {
        Map<String, List<String>> targets = targetsByNotice(rows.stream().map(Notice::getNoticeId).toList());
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Notice n : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("NOTICE_ID", n.getNoticeId());
            map.put("TITLE", n.getTitle());
            map.put("CONTENT", n.getContent());
            map.put("NOTICE_STATUS", n.getNoticeStatus());
            map.put("CONTENT_FORMAT", n.getContentFormat());
            map.put("NOTICE_CATEGORY", n.getNoticeCategory());
            map.put("PIN_YN", n.getPinYn());
            map.put("TARGET_SCOPE", n.getTargetScope());
            map.put("TARGET_ROLES", targets.getOrDefault(n.getNoticeId(), List.of()));
            map.put("POST_START_DT", n.getPostStartDt() == null ? null : n.getPostStartDt().toString());
            map.put("POST_END_DT", n.getPostEndDt() == null ? null : n.getPostEndDt().toString());
            map.put("C_USR_ID", n.getCreatedBy());
            map.put("C_AT", n.getCreatedAt() == null ? null : n.getCreatedAt().toString());
            out.add(map);
        }
        return out;
    }

    /**
     * FE 행 상태 정규화.
     *
     * <p>shared 그리드는 {@code inserted/updated/deleted}({@code nativeeditor_status} 계열)를 쓰고
     * BE 규약은 {@code C/U/D} 다. 변환 유틸이 공용으로 없어 화면마다 이 처리를 한다.
     */
    private String normalizeRowStatus(String raw) {
        if (raw == null) {
            return "";
        }
        return switch (raw.trim().toLowerCase(Locale.ROOT)) {
            case "c", "inserted", "insert", "new" -> "C";
            case "u", "updated", "update", "modified" -> "U";
            case "d", "deleted", "delete", "removed" -> "D";
            default -> "";
        };
    }

    /** {@code yyyy-MM-dd} 파싱. 빈 값·형식 불일치는 null (조회조건 미입력과 동일 취급). */
    private LocalDate parseDate(String raw) {
        if (isBlank(raw)) {
            return null;
        }
        String v = raw.trim();
        if (v.length() > 10) {
            v = v.substring(0, 10); // FE 가 ISO datetime 을 보내는 경우 날짜부만 취한다.
        }
        try {
            return LocalDate.parse(v);
        } catch (Exception e) {
            log.debug("[noticeMgmt] 날짜 파싱 실패 — raw={}", raw);
            return null;
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 게시 대상 (V4)
    // ────────────────────────────────────────────────────────────────

    /**
     * V-008~V-010 — 게시 대상 검증.
     *
     * <p>최종 범위·대상은 {@link #applyRow}·{@link #syncTargets} 와 같은 규칙으로 계산한다 — 키가 없으면 저장된 값(신규는
     * ALL·대상 없음), 키가 있는데 비어 있으면 기본값(ALL·대상 없음). 최종 범위가 ROLE 인데 대상이 비어 있으면 거부한다
     * (아무에게도 보이지 않는 공지가 된다).
     */
    private void validateTargets(Map<String, Object> row, int idx, String rowKey, String storedNoticeId,
                                 List<ErrorDetail> errors) {
        if (!isAllowedOrBlank(row.get("TARGET_SCOPE"), NoticeCodes.SCOPE_DOMAIN)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "TARGET_SCOPE",
                    ErrorCode.INVALID_VALUE.getCode(), "게시 대상은 ALL 또는 ROLE 이어야 합니다."));           // V-008
            return;
        }
        Set<String> roles = row.containsKey("TARGET_ROLES") ? parseRoles(row.get("TARGET_ROLES")) : null;
        if (roles != null) {
            for (String roleId : roles) {
                if (!ROLE_ID_PATTERN.matcher(roleId).matches()) {
                    errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "TARGET_ROLES",
                            ErrorCode.INVALID_VALUE.getCode(), "대상 역할 ID 형식이 올바르지 않습니다: " + roleId)); // V-009
                    return;
                }
            }
        }

        String scope;
        if (row.containsKey("TARGET_SCOPE")) {
            scope = codeOrDefault(row.get("TARGET_SCOPE"), NoticeCodes.SCOPE_ALL);
        } else if (storedNoticeId != null) {
            scope = noticeRepository.findById(storedNoticeId).map(Notice::getTargetScope).orElse(NoticeCodes.SCOPE_ALL);
        } else {
            scope = NoticeCodes.SCOPE_ALL;
        }
        if (!NoticeCodes.SCOPE_ROLE.equals(scope)) {
            return;
        }
        boolean empty = roles != null
                ? roles.isEmpty()
                : storedNoticeId == null || noticeTargetRepository.findByNoticeIds(List.of(storedNoticeId)).isEmpty();
        if (empty) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "TARGET_ROLES",
                    ErrorCode.REQUIRED_VALUE.getCode(), "게시 대상을 역할로 정했으면 역할을 하나 이상 고르세요.")); // V-010
        }
    }

    /**
     * 대상 역할 저장 — 공지 저장 직후 부른다.
     *
     * <ul>
     *   <li>최종 범위가 ALL 이면 남은 대상 행을 지운다(의미 없는 행을 남기지 않는다).</li>
     *   <li>ROLE 이고 {@code TARGET_ROLES} 키가 있으면 그 목록으로 맞춘다 — 빠진 역할만 지우고 새 역할만 넣는다.</li>
     *   <li>ROLE 이고 키가 없으면 저장된 대상을 그대로 둔다(이전 화면 호환, V3 세 컬럼과 같은 규칙).</li>
     * </ul>
     */
    private void syncTargets(Notice entity, Map<String, Object> row) {
        String noticeId = entity.getNoticeId();
        boolean roleScope = NoticeCodes.SCOPE_ROLE.equals(entity.getTargetScope());
        if (roleScope && !row.containsKey("TARGET_ROLES")) {
            return;
        }
        Set<String> wanted = roleScope ? parseRoles(row.get("TARGET_ROLES")) : Set.of();
        List<NoticeTarget> existing = noticeTargetRepository.findByNoticeIds(List.of(noticeId));
        Set<String> kept = new LinkedHashSet<>();
        List<NoticeTarget> removed = new ArrayList<>();
        for (NoticeTarget t : existing) {
            if (wanted.contains(t.getRoleId())) {
                kept.add(t.getRoleId());
            } else {
                removed.add(t);
            }
        }
        noticeTargetRepository.deleteAll(removed);
        List<NoticeTarget> added = new ArrayList<>();
        for (String roleId : wanted) {
            if (!kept.contains(roleId)) {
                added.add(new NoticeTarget(noticeId, roleId));
            }
        }
        noticeTargetRepository.saveAll(added);
    }

    /** 공지번호별 대상 역할 ID (정렬됨). 한 번의 조회로 읽는다. */
    private Map<String, List<String>> targetsByNotice(Collection<String> noticeIds) {
        Map<String, List<String>> out = new HashMap<>();
        if (noticeIds.isEmpty()) {
            return out;
        }
        for (NoticeTarget t : noticeTargetRepository.findByNoticeIds(noticeIds)) {
            out.computeIfAbsent(t.getNoticeId(), k -> new ArrayList<>()).add(t.getRoleId());
        }
        return out;
    }

    /**
     * {@code TARGET_ROLES} 값 → 역할 ID 집합. 배열(JSON array)과 콤마 문자열을 모두 받는다. 앞뒤 공백을 걷고 대문자로 맞추며
     * (BFF 가 역할 헤더를 대문자로 보낸다), 빈 항목은 버리고 중복은 하나로 합친다.
     */
    private static Set<String> parseRoles(Object raw) {
        List<Object> items = new ArrayList<>();
        if (raw instanceof Collection<?> c) {
            items.addAll(c);
        } else if (raw != null) {
            items.addAll(List.of((Object[]) String.valueOf(raw).split(",")));
        }
        Set<String> out = new TreeSet<>();
        for (Object item : items) {
            String v = str(item);
            if (!isBlank(v)) {
                out.add(v.trim().toUpperCase(Locale.ROOT));
            }
        }
        return out;
    }

    /**
     * 조회조건 코드값 정규화 — 빈 값이면 null(전체), 값이 있으면 앞뒤 공백을 걷고 대문자로 맞춘 뒤 허용 코드인지 본다.
     *
     * @throws BusinessException 허용 코드 밖의 값
     */
    private static String searchCode(String raw, Set<String> domain, String label) {
        if (isBlank(raw)) {
            return null;
        }
        String v = raw.trim().toUpperCase(Locale.ROOT);
        if (!domain.contains(v)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, label + " 값이 올바르지 않습니다: " + raw);
        }
        return v;
    }

    /** 저장 행 코드값 검사 — 빈 값(키 없음 포함)은 통과, 값이 있으면 정규화 뒤 허용 코드여야 한다. */
    private static boolean isAllowedOrBlank(Object raw, Set<String> domain) {
        String v = str(raw);
        return isBlank(v) || domain.contains(v.trim().toUpperCase(Locale.ROOT));
    }

    /** 저장 행 코드값 → 저장값. 빈 값이면 기본값. 검증(V-005~V-007)을 통과한 값만 들어온다. */
    private static String codeOrDefault(Object raw, String defaultValue) {
        String v = str(raw);
        return isBlank(v) ? defaultValue : v.trim().toUpperCase(Locale.ROOT);
    }

    /** PIN_YN 은 체크박스가 불리언으로 보낼 수도 있어 {@code true/false} 불리언만 Y/N 으로 바꿔 받는다. 그 밖은 그대로. */
    private static Object yn(Object raw) {
        if (raw instanceof Boolean b) {
            return b ? NoticeCodes.YES : NoticeCodes.NO;
        }
        return raw;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
