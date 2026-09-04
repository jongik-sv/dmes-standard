/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: noticeMgmt (공지사항 관리) OASIS 서비스 — search / save / changeStatus 3 action
 */
package com.dongkuk.dmes.mls.lsh.noticeMgmt.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mls.entity.Notice;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.dto.NoticeMgmtChangeStatusRequest;
import com.dongkuk.dmes.mls.lsh.noticeMgmt.dto.NoticeMgmtSearchRequest;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 공지사항 관리 ({@code noticeMgmt}) OASIS 진입 서비스.
 *
 * <p>정본: {@code docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md}.
 * 본 화면은 <b>As-Is 레거시가 없는 To-Be only 신규 화면</b>이라 분석리포트 인용이 없다
 * (기능설계서 §11.1 GAP-001).
 *
 * <p>BPMN {@code services/lsh/noticeMgmt.bpmn} 의 {@code actionGateway} 3 분기와 1:1 이다.
 * <ul>
 *   <li>{@code search}       → {@link #search(NoticeMgmtSearchRequest)} — §3 조회조건 S-001~S-004</li>
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

    /** LV-001 게시상태 도메인 (기능설계서 §10). 코드 마스터 미등재 — 화면 인라인 상수. */
    private static final Set<String> STATUS_DOMAIN = Set.of("DRAFT", "POSTED", "STOPPED");

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_POSTED = "POSTED";
    private static final String STATUS_STOPPED = "STOPPED";

    /** 채번 prefix 포맷 — {@code NT} + {@code yyyyMMdd}. 일자별 4자리 순번이 뒤에 붙는다. */
    private static final DateTimeFormatter ID_DATE = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.KOREA);

    /** 저장 body 최상위 grid 키 (기능설계서 §1.3 기본값 채택). {@code errors[].grid} 값과 동일해야 한다. */
    private static final String GRID_MASTER = "master";

    private final NoticeRepository noticeRepository;

    public NoticeMgmtService(NoticeRepository noticeRepository) {
        this.noticeRepository = noticeRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search
    // ────────────────────────────────────────────────────────────────

    /**
     * 공지사항 목록 조회 (기능설계서 §3 / B-001).
     *
     * @param request S-001~S-004. null 이면 전건 조회 (화면 최초 진입 시 FE 가 빈 봉투를 보낸다).
     * @return {@code {"list": [...]}} — BPMN {@code output="result"} 로 {@code data.result.list} 에 실린다.
     */
    public Map<String, Object> search(NoticeMgmtSearchRequest request) {
        String title = request != null ? request.getTitle() : null;
        String status = request != null ? request.getNoticeStatus() : null;
        LocalDate fromDt = parseDate(request != null ? request.getPostStartDt() : null);
        LocalDate toDt = parseDate(request != null ? request.getPostEndDt() : null);

        List<Notice> rows = noticeRepository.searchByFilter(title, status, fromDt, toDt);
        log.info("[noticeMgmt] search — title={} status={} from={} to={} rows={}",
                title, status, fromDt, toDt, rows.size());

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
     * @return {@code {"cntMerge": n, "list": [...]}} — 처리 건수 + 재조회 결과 (§5.2 B-003 4단계)
     */
    public Map<String, Object> save(List<Map<String, Object>> master) {
        int cntInsert = 0;
        int cntUpdate = 0;
        int cntDelete = 0;
        List<ErrorDetail> errors = new ArrayList<>();

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
                        validateRow(row, i, noticeId, errors);
                        if (errors.isEmpty()) {
                            insertRow(row);
                            cntInsert++;
                        }
                    }
                    case "U" -> {
                        if (isBlank(noticeId)) {
                            errors.add(ErrorDetail.ofGrid(GRID_MASTER, noticeId, i, "NOTICE_ID",
                                    ErrorCode.REQUIRED_VALUE.getCode(), "수정 대상 공지번호가 없습니다."));
                            continue;
                        }
                        validateRow(row, i, noticeId, errors);
                        if (errors.isEmpty()) {
                            updateRow(noticeId, row, i);
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
        out.put("list", toRows(noticeRepository.searchByFilter(null, null, null, null)));
        return out;
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
        if (!STATUS_DOMAIN.contains(target)) {
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
        out.put("list", toRows(noticeRepository.searchByFilter(null, null, null, null)));
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

    /** V-001~V-004 + XV-001~XV-002 서버 재검증 (기능설계서 §6). */
    private void validateRow(Map<String, Object> row, int idx, String rowKey, List<ErrorDetail> errors) {
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
        if (content != null && content.length() > 4000) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "CONTENT",
                    ErrorCode.INVALID_VALUE.getCode(), "내용은 4000자를 넘을 수 없습니다."));  // V-003
        }
        if (isBlank(status) || !STATUS_DOMAIN.contains(status)) {
            errors.add(ErrorDetail.ofGrid(GRID_MASTER, rowKey, idx, "NOTICE_STATUS",
                    ErrorCode.REQUIRED_VALUE.getCode(), "게시상태를 선택하세요."));           // V-004
        }
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

    private void insertRow(Map<String, Object> row) {
        Notice entity = new Notice(nextNoticeId());
        applyRow(entity, row);
        noticeRepository.save(entity);
    }

    private void updateRow(String noticeId, Map<String, Object> row, int idx) {
        Notice entity = noticeRepository.findById(noticeId).orElseThrow(() ->
                new BusinessException(ErrorCode.INVALID_VALUE, "수정 대상 공지가 없습니다: " + noticeId,
                        List.of(ErrorDetail.ofGrid(GRID_MASTER, noticeId, idx, "NOTICE_ID",
                                ErrorCode.INVALID_VALUE.getCode(), "수정 대상 공지가 없습니다."))));
        applyRow(entity, row);
        noticeRepository.save(entity);
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
        noticeRepository.delete(entity);
    }

    private void applyRow(Notice entity, Map<String, Object> row) {
        entity.setTitle(str(row.get("TITLE")));
        entity.setContent(str(row.get("CONTENT")));
        String status = str(row.get("NOTICE_STATUS"));
        entity.setNoticeStatus(isBlank(status) ? STATUS_DRAFT : status);
        entity.setPostStartDt(parseDate(str(row.get("POST_START_DT"))));
        entity.setPostEndDt(parseDate(str(row.get("POST_END_DT"))));
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

    /** Entity → 화면 행 (기능설계서 §3.2 G-001~G-005 + §4 D-003 내용). */
    private List<Map<String, Object>> toRows(List<Notice> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Notice n : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("NOTICE_ID", n.getNoticeId());
            map.put("TITLE", n.getTitle());
            map.put("CONTENT", n.getContent());
            map.put("NOTICE_STATUS", n.getNoticeStatus());
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

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
