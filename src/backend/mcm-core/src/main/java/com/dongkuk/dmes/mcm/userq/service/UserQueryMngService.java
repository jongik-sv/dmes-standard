package com.dongkuk.dmes.mcm.userq.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryMngRequest;
import com.dongkuk.dmes.mcm.userq.entity.UserQueryAssign;
import com.dongkuk.dmes.mcm.userq.entity.UserQueryDef;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.widget.query.QueryParam;
import com.dongkuk.dmes.mcm.widget.query.QueryParams;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 맞춤 레포트 관리 OASIS 서비스 {@code userQueryMng}(스펙 2026-10-10-user-query-program-design §4.1). BPMN services/cmq/userQueryMng 이 부른다.
 * SYSADMIN 만 호출한다(메뉴 RBAC). SQL 원문·입력 정의·출력 정의를 그대로 다루는 관리자 서비스다.
 * <ul>
 *   <li>{@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1) — 트랜잭션은 OASIS 가 BPMN process 단위로 감싼다(txBiz).</li>
 *   <li>save 는 전체 교체다. 요청에 키가 없는 선택 칸은 null 로 저장한다(기존 값 유지 아님).</li>
 *   <li>저장·실행 때마다 SQL 은 {@link WidgetQueryRunner#validateSql(String, Set)}, 입력 정의는 {@link QueryParams} 로 다시 검사한다.</li>
 * </ul>
 */
@Service("userQueryMngService")
public class UserQueryMngService {

    static final int PREVIEW_MAX_ROWS = 50;
    static final int MAX_ASSIGNS = 2000;
    static final int MAX_USERS = 5000;
    static final int MAX_COLUMNS = 100;
    static final int MAX_DEPTS = 50;
    private static final Pattern QUERY_ID = Pattern.compile("^[A-Z][A-Z0-9_]{2,39}$");
    private static final Set<String> ALIGNS = Set.of("left", "center", "right");
    private static final Set<String> FORMATS = Set.of("text", "number", "date");
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();
    /** LIKE 이스케이프 문자 — 스펙 §4.1 SQL 의 ESCAPE '\\' 와 같다. */
    private static final char ESCAPE = '\\';

    private final UserQueryDefRepository defRepository;
    private final UserQueryAssignRepository assignRepository;
    private final UserQueryStore store;
    private final WidgetQueryRunner queryRunner;
    private final DeptInfoRepository deptRepository;

    @Autowired
    public UserQueryMngService(UserQueryDefRepository defRepository, UserQueryAssignRepository assignRepository,
                               UserQueryStore store, WidgetQueryRunner queryRunner, DeptInfoRepository deptRepository) {
        this.defRepository = defRepository;
        this.assignRepository = assignRepository;
        this.store = store;
        this.queryRunner = queryRunner;
        this.deptRepository = deptRepository;
    }

    // ── 조회 ─────────────────────────────────────────────────────────

    /** 관리 목록 — 조회조건 5개(분류·이름/ID·사용 여부·담당 부서·할당 사용자). LIKE 값은 여기서 이스케이프한다. */
    public Map<String, Object> search(UserQueryMngRequest req) {
        String keyword = escapeLike(blankToNull(req.getKeyword()));
        String ownerDept = escapeLike(blankToNull(req.getOwnerDept()));
        String assignUser = escapeLike(blankToNull(req.getAssignUser()));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] r : store.search(blankToNull(req.getCategoryCd()), keyword, blankToNull(req.getUseYn()),
                ownerDept, assignUser, blankToNull(req.getOwnerDept()))) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("queryId", r[0]);
            m.put("queryNm", r[1]);
            m.put("categoryCd", r[2]);
            m.put("ownerDeptCd", r[3]);
            m.put("ownerDeptNm", r[4]);
            m.put("useYn", String.valueOf(r[5])); // Oracle CHAR 가 Character 로 올 수 있어 글자로 고정한다
            m.put("maxRowCnt", r[6] == null ? null : ((Number) r[6]).intValue());
            m.put("assignCnt", r[7] == null ? 0 : ((Number) r[7]).intValue());
            m.put("uAt", iso(r[8]));
            m.put("uUsrId", r[9]);
            rows.add(m);
        }
        return Map.of("rows", rows);
    }

    /** 정의 전체 — 관리자 서비스라 SQL 원문·JSON 도 그대로 돌려준다. */
    public Map<String, Object> get(UserQueryMngRequest req) {
        UserQueryDef def = requireDef(req.getQueryId());
        Map<String, Object> view = new LinkedHashMap<>();
        view.put("queryId", def.getQueryId());
        view.put("queryNm", def.getQueryNm());
        view.put("categoryCd", def.getCategoryCd());
        view.put("queryDesc", def.getQueryDesc());
        view.put("ownerDeptCd", def.getOwnerDeptCd());
        view.put("ownerDeptNm", def.getOwnerDeptCd() == null ? null : store.deptNm(def.getOwnerDeptCd()));
        view.put("sqlText", def.getSqlText());
        view.put("paramsJson", def.getParamsJson());
        view.put("columnsJson", def.getColumnsJson());
        view.put("maxRowCnt", def.getMaxRowCnt());
        view.put("useYn", def.getUseYn());
        view.put("ver", def.getVersion());
        view.put("cAt", iso(def.getCreatedAt()));
        view.put("cUsrId", def.getCreatedBy());
        view.put("uAt", iso(def.getUpdatedAt()));
        view.put("uUsrId", def.getUpdatedBy());
        return Map.of("def", view);
    }

    /** 미리보기 — 관리자 SQL 작성 도움이라 DB 오류 문구를 그대로 보여 준다(§7). 50행. */
    public Map<String, Object> previewQuery(UserQueryMngRequest req) {
        String sqlText = requireText(req.getSqlText(), null, "조회 SQL");
        WidgetQueryResult r = queryRunner.preview("mcm", sqlText, PREVIEW_MAX_ROWS, blankToNull(req.getParamsJson()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("columns", r.columns());
        out.put("rows", r.rows());
        out.put("truncated", r.truncated());
        return out;
    }

    /** 저장 전 검사 — SQL 이 쓰는 사용자 바인드 이름(처음 나온 순서). */
    public Map<String, Object> validate(UserQueryMngRequest req) {
        String sqlText = requireText(req.getSqlText(), null, "조회 SQL");
        Set<String> declared = QueryParams.names(QueryParams.fromDefsJson(blankToNull(req.getParamsJson())));
        return Map.of("binds", queryRunner.validateSql(sqlText, declared));
    }

    // ── 저장·삭제 ─────────────────────────────────────────────────────

    /**
     * 정의 저장(전체 교체). {@code ver} 가 없으면 신규 — 같은 ID 가 있으면 거절한다. 갱신은 {@code ver} 이 DB 와 다르면 거절한다.
     * 선택 칸(categoryCd·queryDesc·ownerDeptCd·paramsJson·columnsJson)은 요청에 키가 없으면 null 로 저장한다.
     */
    public Map<String, Object> save(UserQueryMngRequest req) {
        String queryId = req.getQueryId() == null ? null : req.getQueryId().strip();
        if (queryId == null || !QUERY_ID.matcher(queryId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "쿼리 ID 는 영문 대문자로 시작하는 3~40자(대문자·숫자·_)여야 합니다");
        }
        String queryNm = requireText(req.getQueryNm(), 100, "쿼리 이름");
        String sqlText = requireText(req.getSqlText(), null, "조회 SQL");
        int maxRowCnt = req.getMaxRowCnt() == null ? 1000 : req.getMaxRowCnt();
        if (maxRowCnt < 1 || maxRowCnt > 5000) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "최대 행 수는 1~5000 사이여야 합니다");
        }
        String useYn = blankToNull(req.getUseYn());
        if (useYn == null) useYn = "Y";
        if (!"Y".equals(useYn) && !"N".equals(useYn)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "사용 여부는 Y·N 이어야 합니다");
        }
        String categoryCd = optional(req.getCategoryCd(), 20, "분류");
        String queryDesc = optional(req.getQueryDesc(), 500, "설명");
        String ownerDeptCd = optional(req.getOwnerDeptCd(), 10, "담당 부서");
        String paramsJson = blankToNull(req.getParamsJson());
        String columnsJson = blankToNull(req.getColumnsJson());

        Set<String> declared = QueryParams.names(QueryParams.fromDefsJson(paramsJson));
        queryRunner.validateSql(sqlText, declared);
        validateColumns(columnsJson);

        UserQueryDef def = defRepository.findById(queryId).orElse(null);
        if (req.getVer() == null) {
            if (def != null) throw new BusinessException(ErrorCode.INVALID_VALUE, "이미 등록된 쿼리 ID 입니다: " + queryId);
            def = new UserQueryDef();
            def.setQueryId(queryId);
        } else {
            if (def == null) throw notFound();
            if (!req.getVer().equals(def.getVersion())) throw conflict();
        }
        def.setQueryNm(queryNm);
        def.setCategoryCd(categoryCd);
        def.setQueryDesc(queryDesc);
        def.setOwnerDeptCd(ownerDeptCd);
        def.setSqlText(sqlText);
        def.setParamsJson(paramsJson);
        def.setColumnsJson(columnsJson);
        def.setMaxRowCnt(maxRowCnt);
        def.setUseYn(useYn);
        // VER 는 McmAuditListener 가 채운다(신규 0·수정 +1). 새 행은 merge 가 복사본을 돌려주고 갱신은 flush 때 올라가므로
        // 반드시 flush 하고 돌려받은 객체에서 읽는다.
        UserQueryDef saved = defRepository.saveAndFlush(def);
        return Map.of("queryId", queryId, "ver", saved.getVersion());
    }

    /** 정의 삭제 — 할당을 먼저 지운다(외래 키가 없어도 남은 할당이 고아가 되지 않게). */
    public Map<String, Object> delete(UserQueryMngRequest req) {
        UserQueryDef def = requireDef(req.getQueryId());
        if (req.getVer() == null || !req.getVer().equals(def.getVersion())) throw conflict();
        int assignDeleted = assignRepository.deleteByQueryId(def.getQueryId());
        defRepository.delete(def);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", 1);
        out.put("assignDeleted", assignDeleted);
        return out;
    }

    // ── 할당 ─────────────────────────────────────────────────────────

    /** 한 정의의 할당 — TB_MCM_SEC_USER 에 없는 사용자는 missingYn='Y' 로 보인다. */
    public Map<String, Object> searchAssign(UserQueryMngRequest req) {
        String queryId = requireQueryId(req.getQueryId());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] r : store.searchAssign(queryId)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", r[0]);
            m.put("userNm", r[1]);
            m.put("deptCd", r[2]);
            m.put("deptNm", r[3]);
            m.put("missingYn", String.valueOf(r[4])); // Oracle CHAR 가 Character 로 올 수 있어 글자로 고정한다
            rows.add(m);
        }
        return Map.of("rows", rows);
    }

    /** 할당 전체 교체 — 없는 사용자 ID 는 거절하고, 새 집합과 DB 집합의 차이만 쓴다. */
    public Map<String, Object> saveAssign(UserQueryMngRequest req) {
        String queryId = requireQueryId(req.getQueryId());
        requireDef(queryId);
        List<String> userIds = parseUserIds(req.getUserIdsJson());
        if (!userIds.isEmpty()) {
            Set<String> existing = new HashSet<>(store.existingUserIds(userIds));
            for (String id : userIds) {
                if (!existing.contains(id)) throw new BusinessException(ErrorCode.INVALID_VALUE, "없는 사용자입니다: " + id);
            }
        }
        Set<String> target = new LinkedHashSet<>(userIds);
        Set<String> current = new HashSet<>();
        for (UserQueryAssign a : assignRepository.findByQueryIdOrderByUserIdAsc(queryId)) current.add(a.getUserId());

        int added = 0;
        for (String userId : target) {
            if (current.contains(userId)) continue;
            assignRepository.save(new UserQueryAssign(queryId, userId));
            added++;
        }
        int removed = 0;
        for (String userId : current) {
            if (target.contains(userId)) continue;
            assignRepository.deleteById(new com.dongkuk.dmes.mcm.userq.entity.UserQueryAssignId(queryId, userId));
            removed++;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("added", added);
        out.put("removed", removed);
        return out;
    }

    /** 할당 후보 — 사용 중 사용자 최대 5000, 잘렸으면 truncated. */
    public Map<String, Object> searchUserList(UserQueryMngRequest req) {
        List<Object[]> rows = store.activeUsers(LocalDateTime.now(), MAX_USERS + 1);
        boolean truncated = rows.size() > MAX_USERS;
        if (truncated) rows = rows.subList(0, MAX_USERS);
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("userId", r[0]);
            m.put("userNm", r[1]);
            m.put("deptCd", r[2]);
            m.put("deptNm", r[3]);
            out.add(m);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", out);
        result.put("truncated", truncated);
        return result;
    }

    /** 담당 부서 고르기 — commWidgetMng/searchDepts 와 같은 모양({@code depts}: deptCd·deptNm·upperDeptCd, 최대 50). */
    public Map<String, Object> searchDepts(UserQueryMngRequest req) {
        String keyword = blankToNull(req.getKeyword());
        String upper = keyword == null ? null : keyword.toUpperCase(Locale.ROOT);
        List<Map<String, Object>> depts = new ArrayList<>();
        for (var d : deptRepository.searchByDeptKey(keyword)) {
            if (upper != null && !startsWith(d.getDeptCd(), upper) && !startsWith(d.getDeptNm(), upper)) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("deptCd", d.getDeptCd());
            m.put("deptNm", d.getDeptNm());
            m.put("upperDeptCd", d.getUpperDeptCd());
            depts.add(m);
            if (depts.size() >= MAX_DEPTS) break;
        }
        return Map.of("depts", depts);
    }

    // ── 검사 도우미 ───────────────────────────────────────────────────

    private UserQueryDef requireDef(String raw) {
        return defRepository.findById(requireQueryId(raw)).orElseThrow(UserQueryMngService::notFound);
    }

    private static String requireQueryId(String raw) {
        String queryId = blankToNull(raw);
        if (queryId == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "쿼리 ID 가 없습니다");
        return queryId;
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.INVALID_VALUE, "쿼리를 찾을 수 없습니다");
    }

    private static BusinessException conflict() {
        return new BusinessException(ErrorCode.BUSINESS_ERROR, "다른 사람이 먼저 고쳤습니다. 다시 조회하세요");
    }

    /** 필수 글자 칸 — 앞뒤 공백을 잘라 1..max 자(검사), 빈 값이면 칸 이름으로 거절한다. */
    private static String requireText(String raw, Integer max, String label) {
        String value = blankToNull(raw);
        if (value == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, label + " 이(가) 없습니다");
        if (max != null && value.length() > max) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, label + " 은(는) " + max + "자 이하여야 합니다");
        }
        return value;
    }

    /** 선택 글자 칸 — 앞뒤 공백을 잘라 max 자 이하로, 빈 값은 null. */
    private static String optional(String raw, int max, String label) {
        String value = blankToNull(raw);
        if (value == null) return null;
        if (value.length() > max) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, label + " 은(는) " + max + "자 이하여야 합니다");
        }
        return value;
    }

    /** 출력 정의 검사(§2.2) — 배열·최대 100개·field 1~128자·align·format 열거값. null·빈 값은 검사 없이 통과. */
    static void validateColumns(String columnsJson) {
        if (columnsJson == null) return;
        JsonNode root;
        try {
            root = JSON.readTree(columnsJson);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의가 JSON 배열이 아닙니다");
        }
        if (!root.isArray()) throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의가 JSON 배열이 아닙니다");
        if (root.size() > MAX_COLUMNS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의는 최대 " + MAX_COLUMNS + "개 입니다");
        }
        for (JsonNode col : root) {
            if (!col.isObject()) throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의가 JSON 배열이 아닙니다");
            JsonNode field = col.get("field");
            if (field == null || !field.isTextual() || field.asText().isBlank() || field.asText().length() > 128) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의의 field 는 1~128자 글자여야 합니다");
            }
            checkEnum(col, "align", ALIGNS);
            checkEnum(col, "format", FORMATS);
            JsonNode width = col.get("width");
            if (width != null && !width.canConvertToInt()) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "출력 정의의 width 는 숫자여야 합니다");
            }
        }
    }

    private static void checkEnum(JsonNode col, String name, Set<String> allowed) {
        JsonNode node = col.get(name);
        if (node == null || node.isNull()) return;
        if (!node.isTextual() || !allowed.contains(node.asText())) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "출력 정의의 " + name + " 은(는) " + String.join("·", allowed.stream().sorted().toList()) + " 이어야 합니다");
        }
    }

    /** userIdsJson — JSON 글자 배열, 최대 2000, 앞뒤 공백 제거·빈 값 무시·중복 하나로. */
    private static List<String> parseUserIds(String userIdsJson) {
        String raw = blankToNull(userIdsJson);
        if (raw == null) return List.of();
        JsonNode root;
        try {
            root = JSON.readTree(raw);
        } catch (Exception e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "할당 사용자 목록이 JSON 배열이 아닙니다");
        }
        if (!root.isArray()) throw new BusinessException(ErrorCode.INVALID_VALUE, "할당 사용자 목록이 JSON 배열이 아닙니다");
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        for (JsonNode node : root) {
            if (!node.isTextual()) throw new BusinessException(ErrorCode.INVALID_VALUE, "할당 사용자 목록이 JSON 배열이 아닙니다");
            String id = blankToNull(node.asText());
            if (id != null) ids.add(id);
        }
        if (ids.size() > MAX_ASSIGNS) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "한 쿼리에 할당할 수 있는 사용자는 최대 " + MAX_ASSIGNS + "명 입니다");
        }
        return new ArrayList<>(ids);
    }

    private static String blankToNull(String raw) {
        if (raw == null) return null;
        String value = raw.strip();
        return value.isEmpty() ? null : value;
    }

    private static boolean startsWith(String value, String upperPrefix) {
        return value != null && value.toUpperCase(Locale.ROOT).startsWith(upperPrefix);
    }

    /** LIKE 와일드카드({@code %}·{@code _})와 이스케이프 문자 앞에 {@code \} 를 붙인다(§4.1). null 은 그대로. */
    private static String escapeLike(String raw) {
        if (raw == null) return null;
        StringBuilder b = new StringBuilder(raw.length() + 4);
        for (char c : raw.toCharArray()) {
            if (c == '%' || c == '_' || c == ESCAPE) b.append(ESCAPE);
            b.append(c);
        }
        return b.toString();
    }

    private static String iso(Object value) {
        if (value == null) return null;
        // 엔티티 감사 칸은 Instant, 네이티브 쿼리는 Timestamp 로 온다. 둘 다 JVM 기본 시간대의 지역 시각으로 맞춘다
        // (Instant 는 TIMESTAMP 칸에 JVM 기본 시간대로 저장된다 — preferred_instant_jdbc_type=TIMESTAMP).
        LocalDateTime t = value instanceof Timestamp ts ? ts.toLocalDateTime()
                : value instanceof Instant i ? LocalDateTime.ofInstant(i, ZoneId.systemDefault())
                : (LocalDateTime) value;
        return ISO.format(t);
    }
}
