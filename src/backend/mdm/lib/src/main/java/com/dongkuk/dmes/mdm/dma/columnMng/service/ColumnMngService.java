package com.dongkuk.dmes.mdm.dma.columnMng.service;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmStdAdminGuard;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.category.MaruIdKind;
import com.dongkuk.dmes.mdm.contract.category.MaruIdNamespace;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngCompareRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSaveRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngSearchRequest;
import com.dongkuk.dmes.mdm.dma.columnMng.dto.ColumnMngViewRequest;
import com.dongkuk.dmes.mdm.dma.naming.ColumnNameComposer;
import com.dongkuk.dmes.mdm.dma.naming.Direction;
import com.dongkuk.dmes.mdm.dma.naming.DomainEntry;
import com.dongkuk.dmes.mdm.dma.naming.DomainMatch;
import com.dongkuk.dmes.mdm.dma.naming.DomainSuggester;
import com.dongkuk.dmes.mdm.dma.naming.LabelSuggester;
import com.dongkuk.dmes.mdm.dma.naming.LabelSuggestion;
import com.dongkuk.dmes.mdm.dma.naming.NameComposition;
import com.dongkuk.dmes.mdm.dma.naming.NameToken;
import com.dongkuk.dmes.mdm.dma.naming.NamingRules;
import com.dongkuk.dmes.mdm.dma.naming.TermCandidate;
import com.dongkuk.dmes.mdm.dma.naming.TermDictionary;
import com.dongkuk.dmes.mdm.dma.naming.TermEntry;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmColumnSystem;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 컬럼 사전({@code columnMng}) OASIS 진입 서비스(TSK-04-04 design.md §6.1·§6.12).
 *
 * <p>BPMN {@code services/dma/columnMng.bpmn} 의 {@code actionGateway} 4 분기와 1:1 이다: {@code search}·{@code view}·
 * {@code compare}(READ, 서버 역할 검사 없음, I15)와 {@code save}(표준 관리자만, D1·I14).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다.</b> 붙이면 CGLIB 프록시가 파라미터 이름을 지워 OASIS 이름 바인딩이
 * {@code ParameterName must not be null} 로 죽는다(F11). 트랜잭션은 OASIS 가 프로세스 단위로 건다 — 저장 중 예외가
 * 나면 앞선 쓰기까지 모두 롤백된다(P8 실측). 그래서 수정한 엔티티도 {@code save} 를 명시적으로 부른다.
 *
 * <p>업무 오류는 화면에 {@code meta.message} 만 도달하므로(F12) {@link MdmErrors#of(MdmErrorCode, String, List)} 로
 * 기본 문구 뒤에 상세를 붙인다(I25).
 */
@Service("columnMngService")
public class ColumnMngService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String REF_KIND_MASTER = "MASTER";
    /** IN 목록 한 번에 넣는 최대 수. */
    private static final int TERM_IN_CHUNK = 500;

    private final MdmColumnRepository columnRepository;
    private final MdmColumnSystemRepository columnSystemRepository;
    private final MdmDomainRepository domainRepository;
    private final MdmTermRepository termRepository;
    private final JdbcTemplate jdbc;
    private final MdmStdAdminGuard guard;
    private final ObjectProvider<MaruIdNamespace> maruIdNamespaces;
    private final ColumnDomainDetailReader domainDetailReader;
    private final MetaRevisionRecorder recorder;

    public ColumnMngService(MdmColumnRepository columnRepository, MdmColumnSystemRepository columnSystemRepository,
                            MdmDomainRepository domainRepository, MdmTermRepository termRepository, JdbcTemplate jdbc,
                            MdmStdAdminGuard guard, ObjectProvider<MaruIdNamespace> maruIdNamespaces,
                            ColumnDomainDetailReader domainDetailReader, MetaRevisionRecorder recorder) {
        this.columnRepository = columnRepository;
        this.columnSystemRepository = columnSystemRepository;
        this.domainRepository = domainRepository;
        this.termRepository = termRepository;
        this.jdbc = jdbc;
        this.guard = guard;
        this.maruIdNamespaces = maruIdNamespaces;
        this.domainDetailReader = domainDetailReader;
        this.recorder = recorder;
    }

    // ── action: search ────────────────────────────────────────────────────

    /**
     * 목록·시스템 목록(도메인은 콤보가 아니라 키워드 조건). 방언별 LIKE·대소문자 비교 차이와 {@code _} 와일드카드를 피하려고 Java 에서 거른다(규모 수천 행).
     * 검색어는 논리명·표준 물리명·시스템별 실제 필드명에 대소문자 무시 부분 일치한다(I30). 도메인 조건({@code domainKeyword})은
     * 도메인 ID·도메인명·표준명에 대소문자 무시 부분 일치한다 — 도메인 전체 목록을 응답에 싣지 않는다.
     */
    public Map<String, Object> search(ColumnMngSearchRequest request) {
        String keyword = request == null || request.getKeyword() == null ? "" : request.getKeyword().trim();
        String needle = keyword.toLowerCase(Locale.ROOT);
        String domainNeedle = request == null || request.getDomainKeyword() == null ? ""
                : request.getDomainKeyword().trim().toLowerCase(Locale.ROOT);

        if (request != null && request.isOptionsOnly()) {
            // 진입 때 시스템 콤보 값만 — 도메인·컬럼·용어·시스템 매핑 전체 조회를 하지 않는다.
            Map<String, Object> options = new LinkedHashMap<>();
            options.put("list", new ArrayList<Map<String, Object>>());
            options.put("systems", systems());
            return options;
        }
        Map<Long, MdmDomain> domainById = domainRepository.findAll().stream()
                .collect(Collectors.toMap(MdmDomain::getDomainId, Function.identity()));
        Map<Long, MdmTerm> termById = termRepository.findAll().stream()
                .collect(Collectors.toMap(MdmTerm::getTermId, Function.identity()));
        Map<Long, List<MdmColumnSystem>> mappingsByColumn = columnSystemRepository.findAll().stream()
                .sorted(MAPPING_ORDER)
                .collect(Collectors.groupingBy(MdmColumnSystem::getColumnId, LinkedHashMap::new, Collectors.toList()));

        List<Map<String, Object>> list = new ArrayList<>();
        columnRepository.findAll().stream()
                .sorted(Comparator.comparing(MdmColumn::getColumnName).thenComparing(MdmColumn::getColumnId))
                .forEach(column -> {
                    List<MdmColumnSystem> mappings = mappingsByColumn.getOrDefault(column.getColumnId(), List.of());
                    if (!domainNeedle.isEmpty() && !domainMatches(column.getDomainId(), domainById, domainNeedle)) {
                        return;
                    }
                    if (!needle.isEmpty() && !matches(column, mappings, needle)) {
                        return;
                    }
                    list.add(listRow(column, domainById.get(column.getDomainId()), mappings, termById));
                });

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("systems", systems());
        return out;
    }

    // ── action: view ──────────────────────────────────────────────────────

    /**
     * 컬럼 상세. {@code columnId} 또는 표준 물리명 {@code physName} 으로 찾는다(둘 다 오면 columnId). 물리명은 그대로 찾고 없으면
     * 대문자로 한 번 더 찾는다. {@code withDomain}(비우면 물리명 조회일 때만)이면 {@code domain} 에 도메인 상세를 싣는다 —
     * columnId 조회의 응답 모양·SQL 문 수는 그대로다({@code ColumnMngQueryCountTest}).
     */
    public Map<String, Object> view(ColumnMngViewRequest request) {
        Long columnId = request == null ? null : request.getColumnId();
        String physName = request == null || request.getPhysName() == null ? "" : request.getPhysName().trim();
        MdmColumn column = (columnId != null ? columnRepository.findById(columnId) : findByPhysName(physName))
                .orElseThrow(() -> invalid("컬럼을 찾을 수 없습니다"));
        boolean withDomain = request != null && request.getWithDomain() != null
                ? request.getWithDomain()
                : columnId == null;

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("columnId", column.getColumnId());
        detail.put("columnName", column.getColumnName());
        detail.put("physName", column.getPhysName());
        detail.put("labelLong", column.getLabelLong());
        detail.put("labelMid", column.getLabelMid());
        detail.put("labelShort", column.getLabelShort());
        detail.put("description", column.getDescription());
        detail.put("domainId", column.getDomainId());
        detail.put("required", column.isRequired());
        detail.put("defaultValue", column.getDefaultValue());
        detail.put("refKind", column.getRefKind());
        detail.put("refTarget", column.getRefTarget());
        detail.put("refCateId", column.getRefCateId());
        detail.put("usageNote", column.getUsageNote());

        List<Map<String, Object>> systems = new ArrayList<>();
        columnSystemRepository.findByColumnId(column.getColumnId()).stream().sorted(MAPPING_ORDER).forEach(m -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("systemCode", m.getSystemCode());
            row.put("physName", m.getPhysName());
            row.put("transform", m.getTransform());
            row.put("note", m.getNote());
            systems.add(row);
        });

        // 용어는 IN 으로 한 번에 읽고 TERM_IDS 순서(중복·없는 용어 포함)대로 다시 늘어놓는다.
        List<Long> termIds = parseTermIds(column.getTermIds());
        Map<Long, MdmTerm> termById = new HashMap<>();
        List<Long> distinctIds = termIds.stream().filter(Objects::nonNull).distinct().toList();
        for (int from = 0; from < distinctIds.size(); from += TERM_IN_CHUNK) {
            termRepository.findAllById(distinctIds.subList(from, Math.min(distinctIds.size(), from + TERM_IN_CHUNK)))
                    .forEach(t -> termById.put(t.getTermId(), t));
        }
        List<Map<String, Object>> terms = new ArrayList<>();
        for (Long termId : termIds) {
            Optional<MdmTerm> term = Optional.ofNullable(termId == null ? null : termById.get(termId));
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("termId", termId);
            row.put("termName", term.map(MdmTerm::getTermName).orElse(termId == null ? NamingRules.PLACEHOLDER : null));
            row.put("senseNo", term.map(MdmTerm::getSenseNo).orElse(null));
            row.put("engAbbr", term.map(MdmTerm::getEngAbbr).orElse(null));
            row.put("missing", term.isEmpty());
            terms.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("column", detail);
        out.put("systems", systems);
        out.put("terms", terms);
        if (withDomain) {
            out.put("domain", domainDetailReader.read(column.getDomainId()));
        }
        return out;
    }

    /** 빈 물리명은 찾지 않는다. 그대로 없으면 대문자로 한 번 더(표준 물리명은 대문자다). */
    private Optional<MdmColumn> findByPhysName(String physName) {
        if (physName.isEmpty()) {
            return Optional.empty();
        }
        Optional<MdmColumn> exact = columnRepository.findByPhysName(physName);
        String upper = physName.toUpperCase(Locale.ROOT);
        return exact.isPresent() || upper.equals(physName) ? exact : columnRepository.findByPhysName(upper);
    }

    // ── action: compare ───────────────────────────────────────────────────

    /**
     * 분해(FORWARD)·역분해(REVERSE)·도메인 추천·중복 검사(D6 — READ 등급). 용어 사전은 요청마다 새로 읽는다(I26).
     */
    public Map<String, Object> compare(ColumnMngCompareRequest request) {
        String input = request == null || request.getInput() == null ? "" : request.getInput().trim();
        if (input.isEmpty()) {
            throw invalid("분해할 이름을 입력하세요");
        }
        Direction direction = direction(request.getDirection());
        ColumnNameComposer composer = new ColumnNameComposer(loadDictionary());
        NameComposition composition = direction == Direction.FORWARD ? composer.forward(input) : composer.reverse(input);

        List<DomainEntry> domainEntries = new ArrayList<>();
        Map<Long, MdmDomain> domainById = new HashMap<>();
        for (MdmDomain d : domainRepository.findAll()) {
            domainEntries.add(new DomainEntry(d.getDomainId(), d.getDomainName(), d.getStdName()));
            domainById.put(d.getDomainId(), d);
        }
        List<DomainMatch> matches = DomainSuggester.suggest(composition.physName(), domainEntries);
        DomainEntry recommended = DomainSuggester.recommended(matches);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("direction", direction.name());
        out.put("input", input);
        out.put("tokens", composition.tokens().stream().map(ColumnMngService::tokenMap).toList());
        out.put("logicalName", composition.logicalName());
        out.put("physName", composition.physName());
        out.put("placeholder", composition.placeholder());
        if (direction == Direction.FORWARD) {
            LabelSuggestion labels = LabelSuggester.suggest(composition.logicalName());
            Map<String, Object> labelMap = new LinkedHashMap<>();
            labelMap.put("labelLong", labels.labelLong());
            labelMap.put("labelMid", labels.labelMid());
            labelMap.put("labelShort", labels.labelShort());
            out.put("labels", labelMap);
        }
        List<Map<String, Object>> domains = new ArrayList<>();
        for (DomainMatch match : matches) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("domainId", match.domain().domainId());
            row.put("domainName", match.domain().domainName());
            row.put("stdName", match.domain().stdName());
            row.put("matchLength", match.matchLength());
            domains.add(row);
        }
        out.put("domains", domains);
        out.put("recommendedDomainId", recommended == null ? null : recommended.domainId());
        out.put("duplicates", duplicates(direction, input, composition, domainById));
        return out;
    }

    // ── action: save ──────────────────────────────────────────────────────

    /**
     * 컬럼 저장(design.md §6.12, 처리 순서 고정). 그리드 {@code systems}·{@code terms} 는 요청 봉투 {@code grids.<이름>.rows}
     * 와 파라미터 이름이 글자 단위로 같아야 바인딩된다. 그리드를 빼고 보내면 바인딩이 실패하므로 화면은 두 그리드를 항상
     * 보낸다(I16, Build 이탈 B1). 시스템 매핑은 차분으로 저장한다(I21).
     */
    public Map<String, Object> save(ColumnMngSaveRequest request, List<Map<String, Object>> systems,
                                    List<Map<String, Object>> terms) {
        // 1. 역할 — 아무 읽기·쓰기 전에(I14)
        guard.requireStdAdmin();
        ColumnMngSaveRequest req = request == null ? new ColumnMngSaveRequest() : request;

        // 2. 필수 — 도메인은 필수가 아니다(D-141). 비우면 DOMAIN_ID 는 NULL 이다.
        String columnName = NamingRules.normalizeLogicalName(req.getColumnName());
        String physName = req.getPhysName() == null ? "" : req.getPhysName().trim();
        if (columnName.isEmpty() || physName.isEmpty()) {
            throw invalid("논리명·표준 물리명은 필수입니다");
        }

        // 3. 자리 표시자(I12) — 형식·길이 검사보다 먼저
        NameComposition composition = new ColumnNameComposer(loadDictionary()).forward(columnName);
        List<String> unresolved = composition.tokens().stream()
                .filter(t -> ColumnNameComposer.isPlaceholder(t.status()))
                .map(NameToken::surface).toList();
        if (physName.contains("*") || columnName.contains("*") || !unresolved.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, String.join(", ", unresolved), List.of());
        }
        List<Long> termIds = resolveTermIds(terms, composition);

        // 4. 형식·길이·존재
        validateFields(req, columnName, physName);

        // 5. 컬럼 유일성
        Long selfId = req.getColumnId();
        Optional<MdmColumn> sameName = columnRepository.findByColumnName(columnName);
        Optional<MdmColumn> samePhys = columnRepository.findByPhysName(physName);
        List<String> clashes = new ArrayList<>();
        sameName.filter(c -> !c.getColumnId().equals(selfId)).ifPresent(c -> clashes.add("논리명 '" + columnName + "'"));
        samePhys.filter(c -> !c.getColumnId().equals(selfId)).ifPresent(c -> clashes.add("물리명 " + physName));
        if (!clashes.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.COLUMN_DUPLICATED, String.join(", ", clashes), List.of());
        }

        // 6. 시스템 매핑 행
        List<MdmColumnSystem> requested = validateMappings(systems, selfId);

        // 7. 컬럼 저장
        MdmColumn column;
        String oldPhysName = null;
        if (selfId == null) {
            column = new MdmColumn(columnName, physName, req.getDomainId());
        } else {
            column = columnRepository.findById(selfId).orElseThrow(() -> invalid("컬럼을 찾을 수 없습니다"));
            oldPhysName = column.getPhysName(); // 메타 캐시 무효화 — 물리명 변경 전 이름(spec 2026-10-02 §3.3)
            column.setColumnName(columnName);
            column.setPhysName(physName);
            column.setDomainId(req.getDomainId());
        }
        column.setLabelLong(blankToNull(req.getLabelLong()));
        column.setLabelMid(blankToNull(req.getLabelMid()));
        column.setLabelShort(blankToNull(req.getLabelShort()));
        column.setDescription(blankToNull(req.getDescription()));
        column.setRequired(Boolean.TRUE.equals(req.getRequired()));
        column.setDefaultValue(blankToNull(req.getDefaultValue()));
        column.setRefKind(blankToNull(req.getRefKind()));
        column.setRefTarget(blankToNull(req.getRefTarget()));
        column.setRefCateId(blankToNull(req.getRefCateId()));
        column.setTermIds(termIds.stream().map(String::valueOf).collect(Collectors.joining(",", "[", "]")));
        column.setUsageNote(blankToNull(req.getUsageNote()));
        column = columnRepository.save(column);
        Long columnId = column.getColumnId();
        recorder.column(oldPhysName, physName);

        // 8. 매핑 차분 — 같은 키는 UPDATE, 새 키는 INSERT, 빠진 키는 DELETE(같은 키를 지웠다 다시 넣지 않는다)
        Map<String, MdmColumnSystem> existing = new LinkedHashMap<>();
        for (MdmColumnSystem m : columnSystemRepository.findByColumnId(columnId)) {
            existing.put(key(m.getSystemCode(), m.getPhysName()), m);
        }
        for (MdmColumnSystem want : requested) {
            MdmColumnSystem have = existing.remove(key(want.getSystemCode(), want.getPhysName()));
            if (have == null) {
                MdmColumnSystem row = new MdmColumnSystem(columnId, want.getSystemCode(), want.getPhysName());
                row.setTransform(want.getTransform());
                row.setNote(want.getNote());
                columnSystemRepository.save(row);
            } else if (!Objects.equals(have.getTransform(), want.getTransform())
                    || !Objects.equals(have.getNote(), want.getNote())) {
                have.setTransform(want.getTransform());
                have.setNote(want.getNote());
                columnSystemRepository.save(have);
            }
        }
        existing.values().forEach(columnSystemRepository::delete);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("columnId", columnId);
        return out;
    }

    // ── save 보조 ─────────────────────────────────────────────────────────

    /** terms 그리드가 비면 재분해 기본 선택을 쓰고, 있으면 모든 termId 가 DB 에 있어야 한다(없으면 MDM017). */
    private List<Long> resolveTermIds(List<Map<String, Object>> terms, NameComposition composition) {
        if (terms == null || terms.isEmpty()) {
            return composition.tokens().stream().map(t -> t.selected().termId()).toList();
        }
        List<Long> ids = new ArrayList<>(terms.size());
        List<String> missing = new ArrayList<>();
        for (Map<String, Object> row : terms) {
            Long id = row == null ? null : toLong(row.get("termId"));
            if (id == null || !termRepository.existsById(id)) {
                missing.add(id == null ? "***" : "용어 ID " + id);
            } else {
                ids.add(id);
            }
        }
        if (!missing.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.NAME_PLACEHOLDER_REMAINS, String.join(", ", missing), List.of());
        }
        return ids;
    }

    private void validateFields(ColumnMngSaveRequest req, String columnName, String physName) {
        if (!NamingRules.STD_PHYS_NAME.matcher(physName).matches()) {
            throw invalid("표준 물리명은 영문 대문자·숫자를 밑줄로 이은 형식이어야 합니다");
        }
        maxLength(columnName, NamingRules.COLUMN_NAME_MAX, "논리명");
        maxLength(physName, NamingRules.CODE_MAX, "표준 물리명");
        maxLength(blankToNull(req.getLabelLong()), NamingRules.LABEL_LONG_MAX, "표시명(긴)");
        maxLength(blankToNull(req.getLabelMid()), NamingRules.LABEL_MID_MAX, "표시명(중간)");
        maxLength(blankToNull(req.getLabelShort()), NamingRules.LABEL_SHORT_MAX, "표시명(짧은)");
        maxLength(blankToNull(req.getDefaultValue()), NamingRules.CODE_MAX, "기본값");
        maxLength(blankToNull(req.getRefTarget()), NamingRules.CODE_MAX, "참조 대상");
        maxLength(blankToNull(req.getRefCateId()), NamingRules.CODE_MAX, "참조 카테고리");
        if (req.getDomainId() != null && !domainRepository.existsById(req.getDomainId())) {
            throw invalid("도메인을 찾을 수 없습니다");
        }
        String refKind = blankToNull(req.getRefKind());
        String refTarget = blankToNull(req.getRefTarget());
        if (refKind != null && !REF_KIND_MASTER.equals(refKind)) {
            throw invalid("참조 종류는 비우거나 MASTER 여야 합니다");
        }
        if (refKind == null && (refTarget != null || blankToNull(req.getRefCateId()) != null)) {
            throw invalid("참조 종류가 비면 참조 대상·참조 카테고리도 비워야 합니다");
        }
        if (REF_KIND_MASTER.equals(refKind)) {
            if (refTarget == null) {
                throw invalid("참조 대상은 참조 종류가 MASTER 일 때 필수입니다");
            }
            List<MaruIdNamespace> masterData = maruIdNamespaces.orderedStream()
                    .filter(ns -> ns.kind() == MaruIdKind.MASTER_DATA).toList();
            if (!masterData.isEmpty() && masterData.stream().noneMatch(ns -> ns.contains(refTarget))) {
                throw invalid("참조 대상 '" + refTarget + "' 가 마루 데이터에 없습니다");
            }
        }
    }

    private List<MdmColumnSystem> validateMappings(List<Map<String, Object>> systems, Long selfId) {
        Set<String> allowed = new LinkedHashSet<>();
        for (Map<String, Object> s : systems()) {
            allowed.add((String) s.get("systemCode"));
        }
        List<MdmColumnSystem> requested = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        List<String> repeated = new ArrayList<>();
        for (Map<String, Object> row : systems == null ? List.<Map<String, Object>>of() : systems) {
            if (row == null) {
                continue;
            }
            String system = trimToEmpty(row.get("systemCode"));
            String phys = trimToEmpty(row.get("physName"));
            if (system.isEmpty() && phys.isEmpty()) {
                continue;
            }
            if (system.isEmpty() || phys.isEmpty()) {
                throw invalid("시스템별 실제 필드명 행에는 시스템과 필드명이 모두 있어야 합니다");
            }
            if (!allowed.contains(system)) {
                throw invalid("시스템 '" + system + "' 는 쓸 수 없습니다");
            }
            String transform = blankToNull(trimToEmpty(row.get("transform")));
            maxLength(phys, NamingRules.CODE_MAX, "실제 필드명");
            maxLength(transform, NamingRules.CODE_MAX, "변환 규칙");
            if (!seen.add(key(system, phys))) {
                repeated.add(system + "·" + phys);
            }
            MdmColumnSystem want = new MdmColumnSystem(selfId, system, phys);
            want.setTransform(transform);
            want.setNote(blankToNull(trimToEmpty(row.get("note"))));
            requested.add(want);
        }
        if (!repeated.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED,
                    String.join(", ", repeated) + " 이(가) 요청 안에서 두 번 나옵니다", List.of());
        }
        List<String> conflicts = new ArrayList<>();
        List<MdmCheckIssue> issues = new ArrayList<>();
        for (MdmColumnSystem want : requested) {
            for (MdmColumnSystem other : columnSystemRepository.findBySystemCodeAndPhysName(want.getSystemCode(),
                    want.getPhysName())) {
                if (!other.getColumnId().equals(selfId)) {
                    String owner = columnRepository.findById(other.getColumnId())
                            .map(MdmColumn::getColumnName).orElse(String.valueOf(other.getColumnId()));
                    String text = want.getSystemCode() + "·" + want.getPhysName() + " → 컬럼 '" + owner + "'";
                    conflicts.add(text);
                    issues.add(new MdmCheckIssue(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED.code(), text,
                            "physName", want.getSystemCode()));
                }
            }
        }
        if (!conflicts.isEmpty()) {
            throw MdmErrors.of(MdmErrorCode.SYSTEM_FIELD_ALREADY_MAPPED, String.join(", ", conflicts), issues);
        }
        return requested;
    }

    // ── 공통 보조 ─────────────────────────────────────────────────────────

    private static final Comparator<MdmColumnSystem> MAPPING_ORDER = Comparator
            .comparing(MdmColumnSystem::getSystemCode).thenComparing(MdmColumnSystem::getPhysName);

    private TermDictionary loadDictionary() {
        List<TermEntry> entries = new ArrayList<>();
        for (MdmTerm t : termRepository.findAll()) {
            entries.add(new TermEntry(t.getTermId(), t.getTermName(), t.getSenseNo(), t.getDefinition(), t.getContext(),
                    t.getEngName(), t.getEngAbbr(), t.getSynonyms(), t.getAliases()));
        }
        return TermDictionary.of(entries);
    }

    private List<Map<String, Object>> systems() {
        return jdbc.queryForList(
                "SELECT SYSTEM_CODE, SYSTEM_NAME FROM TB_MDM_SYSTEM WHERE SELF_YN = 'N' ORDER BY SYSTEM_CODE")
                .stream().map(r -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("systemCode", r.get("SYSTEM_CODE"));
                    row.put("systemName", r.get("SYSTEM_NAME"));
                    return row;
                }).toList();
    }

    /** 도메인 ID(숫자 문자열)·도메인명·표준명에 needle(소문자)이 부분 일치하는지. 도메인이 없는 컬럼은 맞지 않는다. */
    private static boolean domainMatches(Long domainId, Map<Long, MdmDomain> domainById, String needle) {
        MdmDomain domain = domainId == null ? null : domainById.get(domainId);
        if (domain == null) {
            return false;
        }
        return String.valueOf(domain.getDomainId()).contains(needle)
                || lower(domain.getDomainName()).contains(needle)
                || lower(domain.getStdName()).contains(needle);
    }

    private static boolean matches(MdmColumn column, List<MdmColumnSystem> mappings, String needle) {
        if (lower(column.getColumnName()).contains(needle) || lower(column.getPhysName()).contains(needle)) {
            return true;
        }
        return mappings.stream().anyMatch(m -> lower(m.getPhysName()).contains(needle));
    }

    private static Map<String, Object> listRow(MdmColumn column, MdmDomain domain, List<MdmColumnSystem> mappings,
                                               Map<Long, MdmTerm> termById) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("columnId", column.getColumnId());
        row.put("columnName", column.getColumnName());
        row.put("physName", column.getPhysName());
        row.put("labelLong", column.getLabelLong());
        row.put("labelMid", column.getLabelMid());
        row.put("labelShort", column.getLabelShort());
        row.put("domainId", column.getDomainId());
        row.put("domainName", domain == null ? null : domain.getDomainName());
        row.put("domainStdName", domain == null ? null : domain.getStdName());
        row.put("required", column.isRequired() ? "Y" : "N");
        row.put("termNames", parseTermIds(column.getTermIds()).stream()
                .map(id -> id == null ? NamingRules.PLACEHOLDER
                        : termById.containsKey(id) ? termById.get(id).getTermName() : "?")
                .collect(Collectors.joining(" + ")));
        row.put("systemFields", mappings.stream().map(m -> m.getSystemCode() + ":" + m.getPhysName())
                .collect(Collectors.joining(", ")));
        row.put("usageNote", column.getUsageNote());
        return row;
    }

    private List<Map<String, Object>> duplicates(Direction direction, String input, NameComposition composition,
                                                 Map<Long, MdmDomain> domainById) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (direction == Direction.FORWARD) {
            columnRepository.findByColumnName(composition.logicalName())
                    .ifPresent(c -> out.add(duplicate(c, "COLUMN_NAME", null, domainById)));
            if (!composition.placeholder()) {
                columnRepository.findByPhysName(composition.physName())
                        .ifPresent(c -> out.add(duplicate(c, "PHYS_NAME", null, domainById)));
            }
            return out;
        }
        columnRepository.findByPhysName(composition.physName())
                .ifPresent(c -> out.add(duplicate(c, "PHYS_NAME", null, domainById)));
        Set<String> names = new LinkedHashSet<>(List.of(input, input.toUpperCase(Locale.ROOT)));
        columnSystemRepository.findByPhysNameIn(names).stream().sorted(MAPPING_ORDER).forEach(m ->
                columnRepository.findById(m.getColumnId())
                        .ifPresent(c -> out.add(duplicate(c, "SYSTEM_FIELD", m.getSystemCode(), domainById))));
        return out;
    }

    private static Map<String, Object> duplicate(MdmColumn column, String matchedBy, String systemCode,
                                                 Map<Long, MdmDomain> domainById) {
        MdmDomain domain = domainById.get(column.getDomainId());
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("columnId", column.getColumnId());
        row.put("columnName", column.getColumnName());
        row.put("physName", column.getPhysName());
        row.put("usageNote", column.getUsageNote());
        row.put("domainId", column.getDomainId());
        row.put("domainName", domain == null ? null : domain.getDomainName());
        row.put("matchedBy", matchedBy);
        row.put("systemCode", systemCode);
        return row;
    }

    private static Map<String, Object> tokenMap(NameToken token) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("seq", token.seq());
        row.put("surface", token.surface());
        row.put("status", token.status().name());
        TermEntry selected = token.selected();
        row.put("termId", selected == null ? null : selected.termId());
        row.put("termName", selected == null ? null : selected.termName());
        row.put("senseNo", selected == null ? null : selected.senseNo());
        row.put("engAbbr", selected == null ? null : selected.engAbbr());
        row.put("abbr", token.abbr());
        List<Map<String, Object>> candidates = new ArrayList<>();
        for (TermCandidate c : token.candidates()) {
            Map<String, Object> cand = new LinkedHashMap<>();
            cand.put("termId", c.term().termId());
            cand.put("termName", c.term().termName());
            cand.put("senseNo", c.term().senseNo());
            cand.put("definition", c.term().definition());
            cand.put("context", c.term().context());
            cand.put("engAbbr", c.term().engAbbr());
            cand.put("via", c.via().name());
            candidates.add(cand);
        }
        row.put("candidates", candidates);
        return row;
    }

    private static Direction direction(String value) {
        if (value == null || value.isBlank()) {
            return Direction.FORWARD;
        }
        try {
            return Direction.valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw invalid("분해 방향은 FORWARD 또는 REVERSE 여야 합니다");
        }
    }

    /** TERM_IDS JSON 숫자 배열 → ID 목록. JSON {@code null} 은 매칭 안 된 자리({@code ***})라 null 로 남긴다. 그 밖의 잘못된 값은 건너뛴다. */
    static List<Long> parseTermIds(String json) {
        List<Long> ids = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return ids;
        }
        try {
            JsonNode root = JSON.readTree(json);
            if (root != null && root.isArray()) {
                for (JsonNode node : root) {
                    if (node.isNull()) {
                        ids.add(null);
                    } else if (node.canConvertToLong()) {
                        ids.add(node.asLong());
                    }
                }
            }
        } catch (Exception e) {
            return ids;
        }
        return ids;
    }

    private static void maxLength(String value, int max, String label) {
        if (value != null && NamingRules.length(value) > max) {
            throw invalid(label + "은(는) " + max + "자 이하여야 합니다");
        }
    }

    private static RuntimeException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }

    private static String key(String system, String phys) {
        return system + "\u0000" + phys;
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }

    private static String trimToEmpty(Object value) {
        return value == null ? "" : value.toString().trim();
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static Long toLong(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        if (value instanceof String s && !s.isBlank()) {
            try {
                return Long.parseLong(s.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }
}
