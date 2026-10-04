/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: noticeBoard (포털 홈 공지 목록) OASIS 서비스 — search 1 action, 모든 로그인 사용자 읽기 전용
 */
package com.dongkuk.dmes.mls.lsh.noticeBoard.service;

import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.mls.entity.Notice;
import com.dongkuk.dmes.mls.lsh.common.NoticeCodes;
import com.dongkuk.dmes.mls.lsh.common.NoticeHtmlSanitizer;
import com.dongkuk.dmes.mls.lsh.noticeBoard.dto.NoticeBoardSearchRequest;
import com.dongkuk.dmes.mls.repository.NoticeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 포털 홈 공지 목록 ({@code noticeBoard}) OASIS 진입 서비스.
 *
 * <p>정본: {@code docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md} §12 (noticeBoard).
 * BPMN {@code services/lsh/noticeBoard.bpmn} 의 {@code search} 분기와 1:1 이다.
 *
 * <p><b>왜 noticeMgmt 와 따로 두는가</b> — noticeMgmt OBJECT 권한은 관리자 전용이지만 홈 화면은 로그인한 모든 사용자가
 * 본다. 이 서비스의 {@code search} 는 <b>AUTH_ONLY</b>(인증만, 역할 권한 없음) 경로다 — m-mcm {@code proxy.ts}
 * authOnlyPrefixes 의 {@code /api/mls/oasis/noticeBoard/search} 와 mcm-core {@code EndpointPermissionFilter} 의
 * {@code noticeboard/search}. 그래서 OBJECT·역할 매핑 시드가 없고, 런타임에 만든 역할이나 역할이 없는 사용자도 막히지 않는다.
 * 대신 무엇을 보여 줄지는 이 서비스가 현재 사용자 역할로 정한다(게시 대상). 쓰기 action 은 이 서비스에 없다.
 *
 * <p><b>조회 범위는 서버가 고정한다</b> — 게시중({@code POSTED}) + 오늘이 게시기간 안 + 게시 대상(전체 또는 현재 사용자의
 * 역할). 요청으로 받는 값은 건수뿐이다.
 *
 * <p><b>현재 사용자의 역할</b>은 요청 본문이 아니라 {@link UserContextHolder} 에서 읽는다. BFF 가 신뢰 채널(X-Client-Key)로
 * {@code X-Authenticated-Role} 헤더에 JWT 역할 ID 를 싣고, cactus {@code ClientKeyFilter} → {@code JwtAuthenticationFilter}
 * 가 {@code ROLE_} 접두를 붙여 채운다(mdm {@code CactusMdmCurrentUser} 와 같은 경로). 역할 그룹은 헤더에 없고 mcm DB 에만
 * 있어서 대상은 역할 단위다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다 (MUST)</b> — NoticeMgmtService 주석과 같은 이유(OASIS 파라미터명 바인딩,
 * BackEnd 표준 §6-B-1).
 *
 * <p>반환은 noticeMgmt search 와 같은 모양이다 — {@code {"list": [...]}} + BPMN {@code output="result"} →
 * 응답 {@code data.result.list}.
 */
@Service("noticeBoardService")
public class NoticeBoardService {

    private static final Logger log = LoggerFactory.getLogger(NoticeBoardService.class);

    /** 홈 목록 최대 건수. */
    static final int MAX_ROWS = 50;

    private final NoticeRepository noticeRepository;

    public NoticeBoardService(NoticeRepository noticeRepository) {
        this.noticeRepository = noticeRepository;
    }

    /**
     * 홈 공지 목록.
     *
     * <p>정렬: 상단 고정 → 긴급 → 등록 시각 최신순 ({@link NoticeRepository#findBoard}).
     *
     * @param request 건수만 받는다. null·빈 봉투 = 최대 50건.
     * @return {@code {"list": [...]}} — 행 키는 DB 컬럼명 SNAKE_CASE.
     */
    public Map<String, Object> search(NoticeBoardSearchRequest request) {
        int limit = clampLimit(request != null ? request.getLimit() : null);
        LocalDate today = LocalDate.now();

        Set<String> roles = currentRoleIds();
        // 빈 IN 목록은 방언마다 문법 오류라, 역할이 없으면 결코 일치하지 않는 값 하나를 넣는다(전체 대상 공지만 보인다).
        List<String> roleParam = roles.isEmpty() ? List.of(NO_ROLE) : List.copyOf(roles);

        Map<String, Object> out = new LinkedHashMap<>();
        String noticeId = request != null && request.getNoticeId() != null ? request.getNoticeId().trim() : "";
        if (!noticeId.isEmpty()) {
            // 상세 — 행을 고를 때 본문을 받는다(목록은 본문 없이 내려갈 수 있다). 가시성 조건은 목록과 같다.
            List<Notice> one = noticeRepository.findBoardOne(noticeId, NoticeCodes.STATUS_POSTED, today, roleParam);
            log.info("[noticeBoard] detail — noticeId={} found={}", noticeId, !one.isEmpty());
            out.put("list", toRows(one));
            return out;
        }

        boolean withContent = request == null || request.getIncludeContent() == null || request.getIncludeContent();
        if (!withContent) {
            // 본문 칸을 읽지 않는다 — 정렬·조건은 본문 포함 조회와 같다.
            List<Object[]> rows = noticeRepository.findBoardSummary(NoticeCodes.STATUS_POSTED, today, roleParam, Limit.of(limit));
            log.info("[noticeBoard] search(summary) — today={} roles={} limit={} rows={}", today, roles, limit, rows.size());
            out.put("list", toSummaryRows(rows));
            return out;
        }

        List<Notice> rows = noticeRepository.findBoard(NoticeCodes.STATUS_POSTED, today, roleParam, Limit.of(limit));
        log.info("[noticeBoard] search — today={} roles={} limit={} rows={}", today, roles, limit, rows.size());

        out.put("list", toRows(rows));
        return out;
    }

    /** 역할 ID 로 쓰일 수 없는 값(역할 ID 형식은 영문 대문자·숫자·밑줄). */
    private static final String NO_ROLE = "#NO-ROLE#";

    /**
     * 현재 요청 사용자의 역할 ID — {@code ROLE_} 접두를 한 번 떼고 대문자로 맞춘다. 문맥이 없으면 빈 집합(전체 대상만 보인다).
     */
    static Set<String> currentRoleIds() {
        UserInfo user = UserContextHolder.get();
        Set<String> out = new TreeSet<>();
        if (user == null || user.roles() == null) {
            return out;
        }
        for (String role : user.roles()) {
            if (role == null || role.isBlank()) {
                continue;
            }
            String v = role.trim();
            if (v.startsWith("ROLE_")) {
                v = v.substring("ROLE_".length());
            }
            if (!v.isEmpty()) {
                out.add(v.toUpperCase(Locale.ROOT));
            }
        }
        return out;
    }

    static int clampLimit(Integer requested) {
        if (requested == null || requested < 1 || requested > MAX_ROWS) {
            return MAX_ROWS;
        }
        return requested;
    }

    /**
     * Entity → 홈 행.
     *
     * <p>HTML 본문은 내려보낼 때도 한 번 더 소독한다. 저장 경로(noticeMgmt save)가 이미 소독하지만, DB 에 직접 넣은 행이나
     * 소독 규칙이 바뀌기 전에 저장된 행도 모든 사용자의 홈에 그려지기 때문이다. 50건 이하라 비용은 작다.
     *
     * <p>작성자 이름({@code C_USR_NM})은 넣지 않는다 — 사용자 원장은 mcm DB(TB_MCM_SEC_USER)에 있고 mls DB 와 파일이
     * 달라 조인할 수 없다.
     */
    private List<Map<String, Object>> toRows(List<Notice> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Notice n : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("NOTICE_ID", n.getNoticeId());
            map.put("TITLE", n.getTitle());
            map.put("CONTENT", NoticeCodes.FORMAT_HTML.equals(n.getContentFormat())
                    ? NoticeHtmlSanitizer.sanitize(n.getContent())
                    : n.getContent());
            map.put("CONTENT_FORMAT", n.getContentFormat());
            map.put("NOTICE_CATEGORY", n.getNoticeCategory());
            map.put("PIN_YN", n.getPinYn());
            map.put("POST_START_DT", n.getPostStartDt() == null ? null : n.getPostStartDt().toString());
            map.put("POST_END_DT", n.getPostEndDt() == null ? null : n.getPostEndDt().toString());
            map.put("C_USR_ID", n.getCreatedBy());
            map.put("C_AT", n.getCreatedAt() == null ? null : n.getCreatedAt().toString());
            out.add(map);
        }
        return out;
    }

    /** 요약 조회({@link NoticeRepository#findBoardSummary}) 열 → 홈 행. 본문(CONTENT) 키는 싣지 않는다. */
    private List<Map<String, Object>> toSummaryRows(List<Object[]> rows) {
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("NOTICE_ID", r[0]);
            map.put("TITLE", r[1]);
            map.put("CONTENT_FORMAT", r[2]);
            map.put("NOTICE_CATEGORY", r[3]);
            map.put("PIN_YN", r[4]);
            map.put("POST_START_DT", r[5] == null ? null : r[5].toString());
            map.put("POST_END_DT", r[6] == null ? null : r[6].toString());
            map.put("C_USR_ID", r[7]);
            map.put("C_AT", r[8] == null ? null : r[8].toString());
            out.add(map);
        }
        return out;
    }
}
