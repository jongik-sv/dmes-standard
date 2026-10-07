/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: headerMng (전문 헤더 정의) OASIS 서비스 — search / view / save / copy / delete / lock / unlock / handover 8 action
 */
package com.dongkuk.dmes.mdm.dmb.headerMng.service;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstJudge;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssueCode;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemDraft;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutKey;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutOffsetCalculator;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRegistrationRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * 전문 헤더 정의({@code headerMng}) OASIS 진입 서비스(TSK-05-02 design.md §6.1·§6.3).
 *
 * <p>BPMN {@code services/dmb/headerMng.bpmn} 의 {@code actionGateway} 분기와 1:1 이다. 내용 쓰기는 {@code save} 만 하고, 버전 조작
 * ({@code copy}·{@code delete}·{@code lock}·{@code unlock}·{@code handover})은 {@link LayoutVersionService} 에 위임한다. 헤더 항목
 * 오프셋은 그 헤더 안 상대값이다(F8). 인코딩·패딩은 EAI 소유라 EAI 행을 함께 쓴다(D2). TSK-05-03 이 헤더 항목에도 03 등록 거부
 * #2·#3·#4·#7(L12~L15)을 건다.
 *
 * <p>D-144 3단계: <b>저장은 내 DRAFT 에만 쓴다</b> — 그 헤더를 쌓은 전문을 다시 계산하지도, 전문 버전을 만들지도 않는다(I18 폐지 —
 * 헤더 변경은 판정 시각 T 해석으로 전문에 반영된다). 전문 상수 재정의는 헤더 항목 물리명 키라 다시 짝지을 필요가 없다. EAI 는 버전
 * 대상이 아니므로 공유 EAI 행으로 운영·남의 편집을 바꾸지 않게 한다: 원하는 표준 헤더 연결은 헤더 버전 행 {@code EAI_CODE} 에만 쓰고
 * (EAI 의 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전의 {@code EAI_CODE} 로 해석한다 — Ruling P3-15), 그 EAI 를 쓰는 전문이 있으면 인코딩·패딩 변경을 L11 로 거부한다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다</b> — CGLIB 프록시가 파라미터 이름을 잃어 OASIS 바인딩이 죽는다(F11). 트랜잭션은
 * OASIS action 한 건이며, 쓰기 전에 모든 검사를 끝낸다.
 */
@Service("headerMngService")
public class HeaderMngService {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";
    private static final String COLUMN = "COLUMN";
    private static final Set<String> USING_STATES = Set.of("CURRENT", "FUTURE", "DRAFT");

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;
    private final LayoutConstJudge constJudge;
    private final LayoutCodecs codecs;
    private final LayoutVersionStore versionStore;
    private final VersionWriteGuard writeGuard;
    private final LayoutVersionService versionService;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final MetaRevisionRecorder recorder;

    public HeaderMngService(LayoutQueries queries, LayoutDictionary dictionary, LayoutWriter writer,
                            MdmLayoutRepository layoutRepository, MdmEaiRepository eaiRepository, LayoutConstJudge constJudge,
                            LayoutCodecs codecs, LayoutVersionStore versionStore, VersionWriteGuard writeGuard,
                            LayoutVersionService versionService, MdmCurrentUser currentUser, Clock clock,
                            MetaRevisionRecorder recorder) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
        this.constJudge = constJudge;
        this.codecs = codecs;
        this.versionStore = versionStore;
        this.writeGuard = writeGuard;
        this.versionService = versionService;
        this.currentUser = currentUser;
        this.clock = clock;
        this.recorder = recorder;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — target HEADER(기본) 헤더 목록 · COLUMN 컬럼 사전 검색(D8)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(HeaderMngSearchRequest request) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (COLUMN.equals(request.getTarget())) {
            out.put("columns", dictionary.search(request.getKeyword()).stream().map(LayoutColumnInfo::toRow).toList());
            return out;
        }
        List<MdmEai> eais = queries.allEais();
        LocalDateTime now = now();
        // EAI 표준 헤더는 지금 시각으로 해석한다(Ruling P3-15 — TB_MDM_EAI.HEADER_LAYOUT_ID 는 읽지 않는다)
        Map<String, Long> standard = LayoutVersions.eaiHeadersAt(versionStore.releasedHeaderVersions(), now);
        if (request.isOptionsOnly()) {
            // 진입 때 콤보 값만 — 헤더 목록·항목 수·사용 전문 집계를 하지 않는다.
            out.put("headers", new ArrayList<Map<String, Object>>());
            out.put("eais", eais.stream().map(e -> LayoutRows.eaiRow(e, standard.get(e.getEaiCode()))).toList());
            return out;
        }
        // 조건(검색어)이 없고 limit 이 오면 앞쪽 limit 건만 DB 가 읽고 전체 건수는 COUNT 로 센다(화면 성능 가이드 R1)
        int limit = request.getLimit() == null ? 0 : request.getLimit();
        Long totalCount = null;
        List<MdmLayout> headers;
        if (limit > 0 && LayoutRows.text(request.getKeyword()) == null) {
            headers = queries.layoutsOfKind(HEADER, limit);
            totalCount = queries.countOfKind(HEADER);
        } else {
            headers = queries.layoutsOfKind(HEADER).stream()
                    .filter(l -> LayoutRows.matches(l.getLayoutName(), request.getKeyword())).toList();
        }
        // 헤더 버전·항목·사용 전문은 헤더 수와 무관하게 한 번씩 읽는다. 목록 버전은 지금 적용 중(없으면 DRAFT)
        Map<Long, List<MdmLayoutVer>> versions = versionStore.versionsOf(headers.stream().map(MdmLayout::getLayoutId).toList());
        Map<Long, MdmLayoutVer> shown = new HashMap<>();
        for (MdmLayout l : headers) {
            List<MdmLayoutVer> vs = versions.getOrDefault(l.getLayoutId(), List.of());
            LayoutVersions.releasedAt(vs, now).or(() -> LayoutVersions.draft(vs)).or(() -> vs.stream().findFirst())
                    .ifPresent(v -> shown.put(l.getLayoutId(), v));
        }
        Map<LayoutKey, List<MdmLayoutItem>> items = queries.itemsOf(shown.values().stream().map(LayoutKey::of).toList());
        Map<Long, Set<Long>> usedBy = usingMessages(now);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmLayout l : headers) {
            MdmLayoutVer v = shown.get(l.getLayoutId());
            // 헤더의 EAI = 목록 버전(지금 적용 중, 없으면 DRAFT) 행의 EAI_CODE
            MdmEai eai = v == null || v.getEaiCode() == null ? null
                    : eais.stream().filter(e -> e.getEaiCode().equals(v.getEaiCode())).findFirst().orElse(null);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", l.getLayoutId());
            row.put("LAYOUT_NAME", l.getLayoutName());
            row.put("EAI_CODE", eai == null ? null : eai.getEaiCode());
            row.put("ENCODING", eai == null ? null : eai.getEncoding());
            row.put("ITEM_COUNT", v == null ? 0L : (long) items.getOrDefault(LayoutKey.of(v), List.of()).size());
            row.put("TOTAL_LENGTH", v == null ? 0 : v.getOwnLength());
            row.put("USED_BY_COUNT", usedBy.getOrDefault(l.getLayoutId(), Set.of()).size());
            row.put("HEADER_VER", v == null ? null : LayoutRows.ver(v.getVer()));
            row.put("HEADER_STATE", v == null ? null : LayoutVersions.state(v, now));
            row.put("STATUS", l.getStatus());
            row.put("AUD_VER", l.getVersion());
            rows.add(row);
        }
        out.put("headers", rows);
        out.put("eais", eais.stream().map(e -> LayoutRows.eaiRow(e, standard.get(e.getEaiCode()))).toList());
        if (limit > 0) {
            // limit 을 보낸 호출자에게만 싣는다 — 보내지 않는 기존 호출자의 응답 모양은 그대로다
            long total = totalCount != null ? totalCount : rows.size();
            out.put("totalCount", total);
            out.put("truncated", rows.size() < total);
        }
        return out;
    }

    /** 헤더 ID → 그 헤더를 쌓은 전문(지금 적용 중·적용 예정·작성 중 버전) — 전문 수와 무관하게 세 번 읽는다. */
    private Map<Long, Set<Long>> usingMessages(LocalDateTime now) {
        List<Long> messageIds = queries.layoutsOfKind(MESSAGE).stream().map(MdmLayout::getLayoutId).toList();
        List<LayoutKey> keys = new ArrayList<>();
        versionStore.versionsOf(messageIds).values().forEach(vs -> vs.stream()
                .filter(v -> !v.isLegacySnapshot() && USING_STATES.contains(LayoutVersions.state(v, now)))
                .forEach(v -> keys.add(LayoutKey.of(v))));
        Map<Long, Set<Long>> out = new HashMap<>();
        queries.headersOf(keys).forEach((k, stack) -> stack.forEach(h ->
                out.computeIfAbsent(h.getHeaderLayoutId(), x -> new HashSet<>()).add(k.layoutId())));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 헤더 상세(고른 버전)·항목(파생값)·버전 이력·사용 전문 영향도
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(HeaderMngViewRequest request) {
        MdmLayout layout = header(request.getLayoutId());
        LocalDateTime now = now();
        String me = currentUser.userId();
        List<MdmLayoutVer> versions = versionStore.versions(layout.getLayoutId());
        // 버전이 하나도 없으면(유일한 DRAFT 를 지운 헤더) 빈 화면 + 새 버전(major 1.000) 버튼만 켠다(Ruling P3-11)
        boolean none = versions.isEmpty() && (request.getVer() == null || request.getVer().isBlank());
        MdmLayoutVer selected = none ? null : LayoutVersions.select(layout.getLayoutId(), versions, request.getVer(), me, now);
        // 고른 버전 행의 EAI — 그 버전이 RELEASED 인 구간에 이 헤더가 그 EAI 의 표준 헤더다(Ruling P3-15)
        String eaiCode = selected == null ? null : selected.getEaiCode();
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("LAYOUT_ID", layout.getLayoutId());
        header.put("LAYOUT_NAME", layout.getLayoutName());
        header.put("EAI_CODE", eaiCode);
        header.put("EAI_NAME", eai == null ? null : eai.getEaiName());
        header.put("ENCODING", eai == null ? null : eai.getEncoding());
        header.put("PAD_RULE", eai == null ? null : eai.getPadRule());
        header.put("TOTAL_LENGTH", selected == null ? 0 : selected.getOwnLength());
        header.put("STATUS", layout.getStatus());
        header.put("AUD_VER", layout.getVersion());
        List<MdmLayoutItem> items = selected == null ? List.of() : queries.itemsOf(layout.getLayoutId(), selected.getVer());
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(
                items.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).toList());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("header", header);
        out.put("selected", selected == null ? null : LayoutRows.versionRow(selected, now));
        out.put("editable", selected != null && selected.isDraft() && me != null && me.equals(selected.getOwnerId()));
        out.put("items", LayoutRows.items(items, dict));
        out.put("usedBy", usedBy(layout.getLayoutId(), now));
        out.put("units", LayoutRows.units(queries.units()));
        out.put("versions", versions.stream().map(v -> LayoutRows.versionRow(v, now)).toList());
        out.putAll(versionService.flags(versions, layout.getStatus(), now));
        return out;
    }

    /**
     * 이 헤더를 쌓은 전문 버전 — 지금 적용 중·적용 예정·작성 중만(지난 구간·이행 전 이력 제외). {@code TOTAL_LENGTH} 는 지금 시각 헤더
     * 버전으로 합성한 총 길이(쌓인 헤더에 지금 확정 버전이 없으면 null). 전문 수와 무관하게 묶어 읽는다.
     */
    private List<Map<String, Object>> usedBy(Long headerId, LocalDateTime now) {
        List<MdmLayoutHeader> stacks = queries.stacksUsing(headerId);
        List<Long> messageIds = stacks.stream().map(MdmLayoutHeader::getLayoutId).distinct().toList();
        Map<Long, List<MdmLayoutVer>> versions = versionStore.versionsOf(messageIds);
        Map<LayoutKey, MdmLayoutVer> byKey = new HashMap<>();
        versions.values().forEach(vs -> vs.forEach(v -> byKey.put(LayoutKey.of(v), v)));
        List<MdmLayoutHeader> using = new ArrayList<>();
        for (MdmLayoutHeader h : stacks) {
            MdmLayoutVer v = byKey.get(new LayoutKey(h.getLayoutId(), h.getVer()));
            if (v != null && !v.isLegacySnapshot() && USING_STATES.contains(LayoutVersions.state(v, now))) {
                using.add(h);
            }
        }
        Map<Long, MdmLayout> messages = new HashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(using.stream().map(MdmLayoutHeader::getLayoutId).toList())) {
            layoutRepository.findAllById(chunk).forEach(m -> messages.put(m.getLayoutId(), m));
        }
        Map<LayoutKey, List<MdmLayoutHeader>> stackOf = queries.headersOf(
                using.stream().map(h -> new LayoutKey(h.getLayoutId(), h.getVer())).toList());
        Set<Long> stackedHeaders = new HashSet<>();
        stackOf.values().forEach(list -> list.forEach(s -> stackedHeaders.add(s.getHeaderLayoutId())));
        Map<Long, List<MdmLayoutVer>> headerVersions = versionStore.versionsOf(stackedHeaders);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmLayoutHeader h : using) {
            MdmLayout msg = messages.get(h.getLayoutId());
            if (msg == null) {
                continue;
            }
            LayoutKey key = new LayoutKey(h.getLayoutId(), h.getVer());
            MdmLayoutVer v = byKey.get(key);
            Integer total = v.getOwnLength();
            for (MdmLayoutHeader s : stackOf.getOrDefault(key, List.of())) {
                Optional<MdmLayoutVer> hv = LayoutVersions.releasedAt(headerVersions.getOrDefault(s.getHeaderLayoutId(), List.of()), now);
                total = hv.isEmpty() || total == null ? null : total + hv.get().getOwnLength();
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", msg.getLayoutId());
            row.put("LAYOUT_NAME", msg.getLayoutName());
            row.put("SND_SYSTEM", msg.getSndSystem());
            row.put("RCV_SYSTEM", msg.getRcvSystem());
            row.put("VER", LayoutRows.ver(v.getVer()));
            row.put("STATE", LayoutVersions.state(v, now));
            row.put("HEADER_SEQ", h.getSeq());
            row.put("TOTAL_LENGTH", total);
            rows.add(row);
        }
        return rows;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 검사(L11·항목·EAI 인코딩 잠금) → 헤더 부모·EAI → 내 DRAFT 버전 행·항목(§6.3, D-144)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(HeaderMngSaveRequest request, List<Map<String, Object>> items) {
        String me = currentUser.userId();
        List<LayoutItemDraft> drafts = LayoutRows.drafts(items);
        // ② 대상 — 동시 수정(row_version)은 쓰기 직전 beginDraftWrite 가 본다
        MdmLayout layout = request.getLayoutId() == null ? null : header(request.getLayoutId());
        boolean registering = layout == null;
        BigDecimal ver = layout == null ? VersionNumbers.FIRST : LayoutVersions.requireVer(request.getVer());
        long expectedRowVersion = layout == null ? VersionConventions.INITIAL_ROW_VERSION
                : LayoutVersions.requireRowVersion(request.getRowVersion());
        // ③ 기본 속성(L11) + 항목(L01~L08) + EAI 인코딩 잠금(L11) — 하나라도 있으면 쓰기 전에 거부
        String name = LayoutRows.text(request.getLayoutName());
        String eaiCode = LayoutRows.text(request.getEaiCode());
        List<LayoutIssue> issues = new ArrayList<>();
        if (name == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "LAYOUT_NAME", "헤더 이름이 비었다"));
        }
        // 칸 길이(ORA-12899 예방) — EAI 행·헤더 부모를 쓰기 전에 거부한다
        issues.addAll(LayoutRegistrationRules.basicLengthIssues("헤더 이름", name, eaiCode, LayoutRows.text(request.getEaiName()),
                LayoutRows.text(request.getEncoding()), LayoutRows.text(request.getPadRule())));
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        if (eaiCode != null && eai == null
                && (LayoutRows.text(request.getEaiName()) == null || LayoutRows.text(request.getEncoding()) == null)) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "EAI_CODE", "새 EAI 에는 이름과 인코딩이 필요하다: " + eaiCode));
        }
        if (eai != null && eaiCode != null
                && (changed(request.getEncoding(), eai.getEncoding()) || changed(request.getPadRule(), eai.getPadRule()))
                && !versionStore.messagesUsingEai(eaiCode).isEmpty()) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "ENCODING", "EAI " + eaiCode
                    + " 를 쓰는 전문이 있어 인코딩·패딩을 바꿀 수 없다 — EAI 는 버전 대상이 아니라 운영 직렬화가 바로 바뀐다(D-144 3단계)"));
        }
        // 컬럼 사전·도메인 트리는 이 요청에서 한 번씩만 읽는다 — 헤더 저장은 사전·도메인을 고치지 않는다.
        LayoutDictionary.Cache cache = dictionary.cache();
        Map<String, LayoutColumnInfo> dict = cache.byPhysNames(LayoutRows.physNames(drafts));
        issues.addAll(LayoutItemRules.check(drafts, dict));
        // 03 등록 거부 #2·#3·#4·#7(TSK-05-03 L12~L15) — 헤더 인코딩: 요청 → 이 헤더를 가리키는 EAI → 고른 EAI → UTF-8
        issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(), LayoutDraftBuilder.charset(encoding(request, layout, ver, eai)),
                LayoutDraftBuilder.lengthsBySeq(drafts, dict), constJudge.forColumns(LayoutRows.physNames(drafts), cache), new ArrayList<>()));
        if (!issues.isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.HEADER_PREFIX, issues);
        }
        // ④ 길이·상대 오프셋
        List<Integer> lengths = LayoutRows.lengths(drafts, dict);
        LayoutOffsetCalculator.Placed placed = LayoutOffsetCalculator.placeHeader(lengths);
        long rowVersion = expectedRowVersion;
        if (layout != null) {
            // 소유자(MDM003)·row_version(MDM001)·DRAFT(MDM002)·다른 미적용(MDM007)
            rowVersion = writeGuard.beginDraftWrite(new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), ver),
                    expectedRowVersion, me);
        }
        // ⑤ 헤더 부모(CREATED 로 등록, 이름만 갱신)
        boolean renamed = !registering && !Objects.equals(layout.getLayoutName(), name);
        if (layout == null) {
            layout = new MdmLayout(HEADER, name);
        }
        layout.setLayoutName(name);
        layout = writer.saveLayout(layout);
        Long headerId = layout.getLayoutId();
        // 메타 기록(spec 2026-10-02 §3.3) — DRAFT 저장은 피드 값을 바꾸지 않아 기록하지 않는다. 다만 헤더 이름은 버전 무관 부모 칸이라 이 헤더를
        // 쌓은 전문의 RELEASED 합성 스냅샷(headerLayoutName)에도 실린다 — 바뀌었고 헤더에 RELEASED 가 있을 때만 쌓은 전문까지 기록한다
        if (renamed && LayoutVersions.latestReleased(versionStore.versions(headerId)).isPresent()) {
            recorder.layouts(queries.withStackingMessages(headerId));
        }
        // ⑥ EAI 행 — 새 EAI 는 연결 없이 등록, 이미 있는 EAI 는 이름·(잠금을 통과한) 인코딩·패딩만. 표준 헤더는 시각 T 해석(Ruling P3-15)
        if (eaiCode != null) {
            String eaiName = LayoutRows.text(request.getEaiName());
            String encoding = LayoutRows.text(request.getEncoding());
            String padRule = LayoutRows.text(request.getPadRule());
            if (eai == null) {
                eai = new MdmEai(eaiCode, eaiName, encoding);
            }
            if (eaiName != null) {
                eai.setEaiName(eaiName);
            }
            if (encoding != null) {
                eai.setEncoding(encoding);
            }
            if (padRule != null) {
                eai.setPadRule(padRule);
            }
            eaiRepository.saveAndFlush(eai);
        }
        // ⑦ 내 DRAFT 버전 행 — 등록이면 1.000 MAJOR DRAFT(소유자 = 나), 수정이면 길이·원하는 EAI 만(행은 beginDraftWrite 가 확인했다)
        MdmLayoutVer v = registering ? new MdmLayoutVer(headerId, ver, VersionKind.MAJOR, me)
                : versionStore.find(headerId, ver).orElseThrow();
        v.setEaiCode(eaiCode);
        v.setOwnLength(placed.total());
        versionStore.save(v);
        // ⑧ 항목 교체 — 이 버전만. 이 헤더를 쌓은 전문은 건드리지 않는다(I18 폐지)
        writer.replaceItems(headerId, ver, LayoutRows.entities(headerId, ver, drafts, lengths, placed.offsets()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", headerId);
        out.put("ver", VersionNumbers.plain(ver));
        out.put("rowVersion", rowVersion);
        out.put("ownLength", placed.total());
        out.put("totalLength", placed.total());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: copy / delete / lock / unlock / handover — 버전 조작(D-144 3단계). 공통 버전 서비스로만 한다(LayoutVersionService)
    // ────────────────────────────────────────────────────────────────

    /** 새 버전 — {@code verKind} 가 비면 MAJOR. 직전 RELEASED 의 항목을 복사한다. */
    public LayoutVersionResult copy(LayoutVersionRequest request) {
        return versionService.newVersion(request, HEADER);
    }

    /** {@code target} CONFIRM 이면 확정 취소, VERSION(비면 기본)이면 DRAFT 삭제, 그 밖의 값은 INVALID_VALUE. */
    public LayoutVersionResult delete(LayoutVersionRequest request) {
        return versionService.delete(request, HEADER);
    }

    /** DRAFT 선점(담당자만) — 새 row_version. */
    public LayoutVersionResult lock(LayoutVersionRequest request) {
        return versionService.lock(request, HEADER);
    }

    /** DRAFT 해제(소유자만) — 새 row_version. */
    public LayoutVersionResult unlock(LayoutVersionRequest request) {
        return versionService.unlock(request, HEADER);
    }

    /** DRAFT 넘기기(소유자만, 받는 사람은 담당자) — 새 row_version. */
    public LayoutVersionResult handover(LayoutVersionRequest request) {
        return versionService.handover(request, HEADER);
    }

    /** 요청 값이 비어 있지 않고 지금 값과 다르다. */
    private static boolean changed(String requested, String current) {
        String r = LayoutRows.text(requested);
        return r != null && !r.equals(current);
    }

    /** 헤더 바이트 길이를 셀 인코딩 — 요청 → 고치는 버전 행에 지금 담긴 EAI(Ruling P3-15 — 헤더의 EAI 는 버전 행이 정본) → 고른 EAI. */
    private String encoding(HeaderMngSaveRequest request, MdmLayout layout, BigDecimal ver, MdmEai chosen) {
        String requested = LayoutRows.text(request.getEncoding());
        if (requested != null) {
            return requested;
        }
        if (layout != null) {
            Optional<MdmEai> own = versionStore.find(layout.getLayoutId(), ver).map(MdmLayoutVer::getEaiCode)
                    .flatMap(eaiRepository::findById);
            if (own.isPresent()) {
                return own.get().getEncoding();
            }
        }
        return chosen == null ? null : chosen.getEncoding();
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private MdmLayout header(Long layoutId) {
        MdmLayout layout = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (layout == null || !HEADER.equals(layout.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, HEADER);
        }
        return layout;
    }
}
