/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: layoutMng (전문 레이아웃) OASIS 서비스 — search / view / save / validate / execute / export / copy / delete / lock / unlock /
 *       handover 11 action
 */
package com.dongkuk.dmes.mdm.dmb.layoutMng.service;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCheckTable;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstResolver;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraft;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutImpactFinder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutKey;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutNumFormat;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutNumFormatCodec;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSampleRenderer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutTimes;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExecuteRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExportRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionResult;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * 전문 레이아웃({@code layoutMng}) OASIS 진입 서비스(TSK-05-02 design.md §6.1·§6.3).
 *
 * <p>BPMN {@code services/dmb/layoutMng.bpmn} 의 {@code actionGateway} 분기와 1:1 이다. 내용 쓰기는 {@code save} 만 하고, 버전 조작
 * ({@code copy}·{@code delete}·{@code lock}·{@code unlock}·{@code handover})은 {@link LayoutVersionService} 에 위임한다.
 * <b>{@code save} 에는 헤더 항목을 받는 입력이 없다</b> — 전문에서 헤더 구성은 잠기고, 재정의는 {@code TB_MDM_LAYOUT_CONST} 에만
 * 쓴다(불변 I8). EAI 를 고른 전문에는 그 EAI 표준 헤더가 헤더 구성 1번에 들어간다(I14 — 판정 시각에 확정된 표준 헤더만).
 *
 * <p>D-144 3단계: <b>저장은 내 DRAFT 에만 쓴다</b>(소유자·row_version·DRAFT 는 공통 {@link VersionWriteGuard#beginDraftWrite} 가 본다).
 * 저장이 버전을 만들지 않는다(I15 폐지) — 버전은 새 버전(copy)·확정(layoutConfirm)으로 바뀐다. 조회·검증·샘플·내보내기는 판정 시각
 * T({@code asOf}, 비면 지금)의 헤더 버전으로 합성한다. 본문 항목 오프셋은 본문 시작 기준 상대값으로 저장하고, 화면 응답({@code view})은
 * 헤더 길이 합을 더한 절대값으로 준다.
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다</b>(F11). 트랜잭션은 OASIS action 한 건이며, 쓰기 전에 모든 검사를 끝낸다.
 */
@Service("layoutMngService")
public class LayoutMngService {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";
    private static final String COLUMN = "COLUMN";
    private static final String IMPACT = "IMPACT";
    private static final String MISSING = "MISSING";
    private static final DateTimeFormatter SEND_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final LayoutDraftBuilder draftBuilder;
    private final LayoutVersionStore versionStore;
    private final LayoutSnapshotAssembler assembler;
    private final LayoutComposer composer;
    private final LayoutSampleRenderer renderer;
    private final LayoutImpactFinder impactFinder;
    private final VersionWriteGuard writeGuard;
    private final LayoutVersionService versionService;
    private final MdmCurrentUser currentUser;
    private final Clock clock;
    private final MetaRevisionRecorder recorder;

    public LayoutMngService(LayoutQueries queries, LayoutDictionary dictionary, LayoutWriter writer,
                            MdmLayoutRepository layoutRepository, LayoutDraftBuilder draftBuilder, LayoutVersionStore versionStore,
                            LayoutSnapshotAssembler assembler, LayoutComposer composer, LayoutSampleRenderer renderer,
                            LayoutImpactFinder impactFinder, VersionWriteGuard writeGuard, LayoutVersionService versionService,
                            MdmCurrentUser currentUser, Clock clock, MetaRevisionRecorder recorder) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.draftBuilder = draftBuilder;
        this.versionStore = versionStore;
        this.assembler = assembler;
        this.composer = composer;
        this.renderer = renderer;
        this.impactFinder = impactFinder;
        this.writeGuard = writeGuard;
        this.versionService = versionService;
        this.currentUser = currentUser;
        this.clock = clock;
        this.recorder = recorder;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — target LAYOUT(기본) 전문 목록 · HEADER 헤더 선택 · COLUMN 컬럼 사전 검색(D8) · IMPACT 영향 전문(TSK-05-03)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(LayoutMngSearchRequest request) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (IMPACT.equals(request.getTarget())) {
            out.put("impacts", impactFinder.search(request.getKeyword()));
            return out;
        }
        if (COLUMN.equals(request.getTarget())) {
            out.put("columns", dictionary.search(request.getKeyword()).stream().map(LayoutColumnInfo::toRow).toList());
            return out;
        }
        LocalDateTime now = now();
        List<MdmLayout> headerLayouts = queries.layoutsOfKind(HEADER);
        if (HEADER.equals(request.getTarget())) {
            out.put("headers", headerPicks(headerLayouts, request.getKeyword(), now));
            return out;
        }
        // 헤더 버전은 헤더 수와 무관하게 한 번 읽는다 — 헤더 콤보 길이·전문 목록 총 길이가 같이 쓴다
        Map<Long, List<MdmLayoutVer>> headerVersions = versionStore.versionsOf(headerLayouts.stream().map(MdmLayout::getLayoutId).toList());
        List<Map<String, Object>> layouts = new ArrayList<>();
        if (!request.isOptionsOnly()) { // 진입 때 콤보 값만 — 전문 목록·헤더 스택·항목 수 집계를 하지 않는다.
            layouts = messageRows(request, headerLayouts, headerVersions, now);
        }
        out.put("layouts", layouts);
        List<Map<String, Object>> systems = new ArrayList<>();
        for (Object[] r : queries.systems()) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("SYSTEM_CODE", r[0]);
            s.put("SYSTEM_NAME", r[1]);
            systems.add(s);
        }
        out.put("systems", systems);
        // EAI 표준 헤더는 지금 시각으로 해석한다(Ruling P3-15) — 이미 읽은 헤더 버전으로, 쿼리를 더하지 않는다
        Map<String, Long> standard = LayoutVersions.eaiHeadersAt(headerVersions, now);
        out.put("eais", queries.allEais().stream().map(e -> LayoutRows.eaiRow(e, standard.get(e.getEaiCode()))).toList());
        List<Map<String, Object>> options = new ArrayList<>();
        for (MdmLayout h : headerLayouts) {
            MdmLayoutVer shown = shown(headerVersions.getOrDefault(h.getLayoutId(), List.of()), now);
            options.add(headerOption(h, shown == null ? 0 : shown.getOwnLength()));
        }
        out.put("headers", options);
        return out;
    }

    /**
     * 헤더 추가 팝업 — 헤더마다 지금 시각 RELEASED 의 항목·길이(저장 전 전문에서도 상수 편집을 열 수 있게). RELEASED 가 없는 헤더는
     * 쌓을 수 없으므로 뺀다. 버전·항목·EAI 는 헤더 수와 무관하게 IN 으로 한 번씩 읽는다(항목 SEQ 순, EAI 코드 순 첫 행).
     */
    private List<Map<String, Object>> headerPicks(List<MdmLayout> headerLayouts, String keyword, LocalDateTime now) {
        List<MdmLayout> picked = headerLayouts.stream().filter(h -> LayoutRows.matches(h.getLayoutName(), keyword)).toList();
        List<Long> pickedIds = picked.stream().map(MdmLayout::getLayoutId).toList();
        Map<Long, List<MdmLayoutVer>> versions = versionStore.versionsOf(pickedIds);
        Map<Long, MdmLayoutVer> current = new HashMap<>();
        for (MdmLayout h : picked) {
            LayoutVersions.releasedAt(versions.getOrDefault(h.getLayoutId(), List.of()), now).ifPresent(v -> current.put(h.getLayoutId(), v));
        }
        Map<LayoutKey, List<MdmLayoutItem>> items = queries.itemsOf(current.values().stream().map(LayoutKey::of).toList());
        List<String> phys = new ArrayList<>();
        items.values().forEach(list -> list.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add));
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmLayout h : picked) {
            MdmLayoutVer v = current.get(h.getLayoutId());
            if (v == null) {
                continue;
            }
            Map<String, Object> row = headerOption(h, v.getOwnLength());
            row.put("EAI_CODE", v.getEaiCode()); // 지금 적용 중인 헤더 버전의 EAI(Ruling P3-15)
            row.put("items", LayoutRows.items(items.getOrDefault(LayoutKey.of(v), List.of()), dict));
            rows.add(row);
        }
        return rows;
    }

    /**
     * 전문 목록 — 현재 적용 버전 기준(없으면 첫 DRAFT), 길이는 지금 시각 헤더 버전으로 합성한다. 버전·헤더 구성·항목은 전문 수와 무관하게
     * 한 번씩 읽는다.
     */
    private List<Map<String, Object>> messageRows(LayoutMngSearchRequest request, List<MdmLayout> headerLayouts,
                                                  Map<Long, List<MdmLayoutVer>> headerVersions, LocalDateTime now) {
        String snd = LayoutRows.text(request.getSndSystem());
        String rcv = LayoutRows.text(request.getRcvSystem());
        List<MdmLayout> messages = queries.layoutsOfKind(MESSAGE).stream()
                .filter(l -> LayoutRows.matches(l.getLayoutName(), request.getKeyword()))
                .filter(l -> (snd == null || snd.equals(l.getSndSystem())) && (rcv == null || rcv.equals(l.getRcvSystem())))
                .toList();
        Map<Long, List<MdmLayoutVer>> versions = versionStore.versionsOf(messages.stream().map(MdmLayout::getLayoutId).toList());
        Map<Long, MdmLayoutVer> basis = new HashMap<>();
        for (MdmLayout l : messages) {
            MdmLayoutVer b = shown(versions.getOrDefault(l.getLayoutId(), List.of()), now);
            if (b != null) {
                basis.put(l.getLayoutId(), b);
            }
        }
        List<LayoutKey> keys = basis.values().stream().filter(v -> !v.isLegacySnapshot()).map(LayoutKey::of).toList();
        Map<LayoutKey, List<MdmLayoutHeader>> stacks = queries.headersOf(keys);
        Map<LayoutKey, List<MdmLayoutItem>> items = queries.itemsOf(keys);
        Map<Long, String> headerNames = new HashMap<>();
        headerLayouts.forEach(h -> headerNames.put(h.getLayoutId(), h.getLayoutName()));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmLayout l : messages) {
            List<MdmLayoutVer> vs = versions.getOrDefault(l.getLayoutId(), List.of());
            MdmLayoutVer b = basis.get(l.getLayoutId());
            List<Long> stack = new ArrayList<>();
            List<String> summary = new ArrayList<>();
            Integer total;
            int itemCount;
            if (b != null && b.isLegacySnapshot()) {
                MdmLayoutSnapshot s = LayoutSnapshotJson.read(b.getSnapshotJson());
                for (MdmLayoutHeaderRef h : s.headers()) {
                    stack.add(h.headerLayoutId());
                    summary.add(h.headerLayoutName() + " (" + h.totalLength() + ")");
                }
                total = s.totalLength();
                itemCount = s.items().size();
            } else {
                LayoutKey key = b == null ? null : LayoutKey.of(b);
                total = b == null ? 0 : b.getOwnLength();
                for (MdmLayoutHeader h : key == null ? List.<MdmLayoutHeader>of() : stacks.getOrDefault(key, List.of())) {
                    long hid = h.getHeaderLayoutId();
                    Optional<MdmLayoutVer> hv = LayoutVersions.releasedAt(headerVersions.getOrDefault(hid, List.of()), now);
                    stack.add(hid);
                    summary.add(headerNames.get(hid) + " (" + hv.map(v -> String.valueOf(v.getOwnLength())).orElse("-") + ")");
                    // 쌓인 헤더 하나라도 지금 확정 버전이 없으면 길이를 모른다 — 0 으로 더하지 않고 null(headerMng usedBy 와 같다)
                    total = hv.isEmpty() || total == null ? null : total + hv.get().getOwnLength();
                }
                itemCount = key == null ? 0 : items.getOrDefault(key, List.of()).size();
            }
            if (request.getHeaderLayoutId() != null && !stack.contains(request.getHeaderLayoutId())) {
                continue;
            }
            Optional<MdmLayoutVer> current = LayoutVersions.releasedAt(vs, now);
            Optional<MdmLayoutVer> draft = LayoutVersions.draft(vs);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", l.getLayoutId());
            row.put("LAYOUT_NAME", l.getLayoutName());
            row.put("EAI_CODE", b == null ? null : b.getEaiCode());
            row.put("SND_SYSTEM", l.getSndSystem());
            row.put("RCV_SYSTEM", l.getRcvSystem());
            row.put("STATUS", l.getStatus());
            row.put("CURRENT_VER", current.map(v -> LayoutRows.ver(v.getVer())).orElse(null));
            row.put("DRAFT_VER", draft.map(v -> LayoutRows.ver(v.getVer())).orElse(null));
            row.put("DRAFT_OWNER", draft.map(MdmLayoutVer::getOwnerId).orElse(null));
            row.put("HEADER_SUMMARY", String.join(" + ", summary));
            row.put("ITEM_COUNT", (long) itemCount);
            row.put("TOTAL_LENGTH", total);
            row.put("AUD_VER", l.getVersion());
            rows.add(row);
        }
        return rows;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 기본 속성·헤더 구성(판정 시각 T 의 헤더 버전·실효값)·본문 항목·버전 이력
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(LayoutMngViewRequest request) {
        MdmLayout layout = message(request.getLayoutId());
        LocalDateTime now = now();
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        String me = currentUser.userId();
        List<MdmLayoutVer> versions = versionStore.versions(layout.getLayoutId());
        // 버전이 하나도 없으면(유일한 DRAFT 를 지운 전문) 빈 화면 + 새 버전(major 1.000) 버튼만 켠다(Ruling P3-11)
        MdmLayoutVer selected = noVersions(versions, request.getVer()) ? null
                : LayoutVersions.select(layout.getLayoutId(), versions, request.getVer(), me, now);
        Map<String, Object> view = selected == null ? emptyView()
                : selected.isLegacySnapshot() ? legacyView(selected) : composedView(layout.getLayoutId(), selected, asOf, now);
        Integer headerLength = (Integer) view.remove("headerLength");
        Integer totalLength = (Integer) view.remove("totalLength");
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("LAYOUT_ID", layout.getLayoutId());
        info.put("LAYOUT_NAME", layout.getLayoutName());
        info.put("EAI_CODE", selected == null ? null : selected.getEaiCode());
        info.put("SND_SYSTEM", layout.getSndSystem());
        info.put("RCV_SYSTEM", layout.getRcvSystem());
        info.put("STATUS", layout.getStatus());
        info.put("TOTAL_LENGTH", totalLength);
        info.put("HEADER_LENGTH", headerLength);
        info.put("OWN_LENGTH", headerLength == null ? selected.getOwnLength() : totalLength - headerLength);
        info.put("AUD_VER", layout.getVersion());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layout", info);
        out.put("selected", selected == null ? null : LayoutRows.versionRow(selected, now));
        out.put("editable", selected != null && !selected.isLegacySnapshot() && selected.isDraft() && me != null
                && me.equals(selected.getOwnerId()));
        out.put("asOf", LayoutTimes.text(asOf));
        out.put("headers", view.get("headers"));
        out.put("items", view.get("items"));
        out.put("units", LayoutRows.units(queries.units()));
        out.put("versions", versions.stream().map(v -> LayoutRows.versionRow(v, now)).toList());
        out.putAll(versionService.flags(versions, layout.getStatus(), now));
        return out;
    }

    /**
     * 저장된 버전 행 + 판정 시각 T 의 헤더 버전. 헤더에 T 시점 확정 버전이 없으면 항목 없이 {@code HEADER_STATE = MISSING} 이고, 그 헤더의
     * 길이·그 뒤 헤더의 OFFSET·헤더 길이 합·총 길이·본문 절대 OFFSET 은 null 이다(0 으로 조용히 합성하지 않는다 — Review Focus 2).
     */
    private Map<String, Object> composedView(long messageId, MdmLayoutVer selected, LocalDateTime asOf, LocalDateTime now) {
        List<MdmLayoutHeader> stack = queries.headersOf(messageId, selected.getVer());
        Map<String, String> overrides = new HashMap<>();
        for (MdmLayoutConst c : queries.constsOf(messageId, selected.getVer())) {
            overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderColumnPhys(), c.getConstValue());
        }
        List<MdmLayoutItem> body = queries.itemsOf(messageId, selected.getVer());
        List<Long> headerIds = stack.stream().map(MdmLayoutHeader::getHeaderLayoutId).toList();
        Map<Long, MdmLayout> headerLayouts = new HashMap<>();
        layoutRepository.findAllById(headerIds).forEach(h -> headerLayouts.put(h.getLayoutId(), h));
        List<Optional<MdmLayoutVer>> headerVers = new ArrayList<>();
        List<List<MdmLayoutItem>> headerItems = new ArrayList<>();
        List<String> phys = new ArrayList<>();
        for (MdmLayoutHeader h : stack) {
            Optional<MdmLayoutVer> hv = composer.headerAt(h.getHeaderLayoutId(), asOf);
            List<MdmLayoutItem> items = hv.map(v -> queries.itemsOf(h.getHeaderLayoutId(), v.getVer())).orElse(List.of());
            headerVers.add(hv);
            headerItems.add(items);
            items.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add);
        }
        body.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        List<Map<String, Object>> headers = new ArrayList<>();
        Integer at = 0;
        for (int i = 0; i < stack.size(); i++) {
            MdmLayoutHeader h = stack.get(i);
            Optional<MdmLayoutVer> hv = headerVers.get(i);
            MdmLayout hl = headerLayouts.get(h.getHeaderLayoutId());
            List<Map<String, Object>> items = new ArrayList<>();
            for (MdmLayoutItem it : headerItems.get(i)) {
                Map<String, Object> row = LayoutRows.item(it, it.getColumnPhys() == null ? null : dict.get(it.getColumnPhys()));
                String override = MdmFillKind.CONST.name().equals(it.getFillKind()) && it.getColumnPhys() != null
                        ? overrides.get(h.getHeaderLayoutId() + ":" + it.getColumnPhys()) : null;
                row.put("OVERRIDE_VALUE", override);
                row.put("EFFECTIVE_VALUE", LayoutConstResolver.effective(LayoutFillKinds.parse(it.getFillKind()), it.getDefaultValue(), override));
                items.add(row);
            }
            Integer len = hv.map(MdmLayoutVer::getOwnLength).orElse(null);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("SEQ", h.getSeq());
            row.put("HEADER_LAYOUT_ID", h.getHeaderLayoutId());
            row.put("HEADER_NAME", hl == null ? null : hl.getLayoutName());
            row.put("EAI_CODE", hv.map(MdmLayoutVer::getEaiCode).orElse(null)); // 판정 시각 헤더 버전의 EAI(Ruling P3-15)
            row.put("TOTAL_LENGTH", len);
            row.put("OFFSET", at);
            row.put("HEADER_VER", hv.map(v -> LayoutRows.ver(v.getVer())).orElse(null));
            row.put("HEADER_STATE", hv.map(v -> LayoutVersions.state(v, now)).orElse(MISSING));
            row.put("items", items);
            headers.add(row);
            at = at == null || len == null ? null : at + len;
        }
        Integer headerLength = at;
        List<Map<String, Object>> bodyRows = LayoutRows.items(body, dict);
        for (Map<String, Object> row : bodyRows) {
            // 저장은 본문 기준 상대, 화면은 절대(호환). 헤더 길이를 모르면 절대값도 모른다
            row.put("OFFSET", headerLength == null ? null : headerLength + ((Number) row.get("OFFSET")).intValue());
        }
        Map<String, Object> out = new HashMap<>();
        out.put("headers", headers);
        out.put("items", bodyRows);
        out.put("headerLength", headerLength);
        out.put("totalLength", headerLength == null ? null : headerLength + selected.getOwnLength());
        return out;
    }

    /** 버전이 없고 특정 버전을 요청하지도 않았다 — view 는 빈 화면을 준다. */
    private static boolean noVersions(List<MdmLayoutVer> versions, String requested) {
        return versions.isEmpty() && (requested == null || requested.isBlank());
    }

    /** 버전이 없는 전문 — 헤더 구성·항목 없음, 길이 0. */
    private static Map<String, Object> emptyView() {
        Map<String, Object> out = new HashMap<>();
        out.put("headers", List.of());
        out.put("items", List.of());
        out.put("headerLength", 0);
        out.put("totalLength", 0);
        return out;
    }

    /** 이행 전 이력(LEGACY) — 저장된 합성 스냅샷의 헤더·항목을 그대로 푼다(읽기 전용). */
    private Map<String, Object> legacyView(MdmLayoutVer selected) {
        MdmLayoutSnapshot s = LayoutSnapshotJson.read(selected.getSnapshotJson());
        List<String> phys = new ArrayList<>();
        s.headers().forEach(h -> h.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(phys::add));
        s.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
        List<Map<String, Object>> headers = new ArrayList<>();
        int headerLength = 0;
        for (MdmLayoutHeaderRef h : s.headers()) {
            List<Map<String, Object>> items = new ArrayList<>();
            for (MdmLayoutItemSnapshot it : h.items()) {
                Map<String, Object> row = snapshotItemRow(s.layoutId(), it, dict);
                row.put("OVERRIDE_VALUE", it.overrideValue());
                row.put("EFFECTIVE_VALUE", LayoutConstResolver.effective(it.fillKind(), it.defaultValue(), it.overrideValue()));
                items.add(row);
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("SEQ", h.seq());
            row.put("HEADER_LAYOUT_ID", h.headerLayoutId());
            row.put("HEADER_NAME", h.headerLayoutName());
            row.put("EAI_CODE", null);
            row.put("TOTAL_LENGTH", h.totalLength());
            row.put("OFFSET", h.offset());
            row.put("HEADER_VER", LayoutRows.ver(h.headerVersion()));
            row.put("HEADER_STATE", "LEGACY");
            row.put("items", items);
            headers.add(row);
            headerLength += h.totalLength();
        }
        List<Map<String, Object>> body = new ArrayList<>();
        for (MdmLayoutItemSnapshot it : s.items()) {
            body.add(snapshotItemRow(s.layoutId(), it, dict)); // 스냅샷 오프셋은 이미 메시지 절대값
        }
        Map<String, Object> out = new HashMap<>();
        out.put("headers", headers);
        out.put("items", body);
        out.put("headerLength", headerLength);
        out.put("totalLength", s.totalLength());
        return out;
    }

    private static Map<String, Object> snapshotItemRow(long layoutId, MdmLayoutItemSnapshot it, Map<String, LayoutColumnInfo> dict) {
        MdmLayoutItem e = new MdmLayoutItem(layoutId, VersionNumbers.FIRST, it.seq(), it.fillKind().name());
        e.setColumnPhys(it.columnPhys());
        e.setTransUnit(it.transUnit());
        e.setUnitItem(it.unitItem());
        e.setNumFormat(it.numFormat() == null ? null : LayoutNumFormatCodec.encode(new LayoutNumFormat(it.numFormat().sign(),
                it.numFormat().zeroPad(), it.numFormat().impliedScale(), it.length())));
        e.setDefaultValue(it.defaultValue());
        e.setFillerLength(it.fillerLength());
        e.setOffset(it.offset());
        e.setLength(it.length());
        return LayoutRows.item(e, it.columnPhys() == null ? null : dict.get(it.columnPhys()));
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 기본 속성(L11) → 헤더 구성(L09) → 재정의(L10) → 본문(L01~L08) → 계산 → 내 DRAFT 에 쓰기(§6.3, D-144)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                    List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        String me = currentUser.userId();
        // ①~⑤ 대상 → 검사 → 길이·배치(LayoutDraftBuilder 한 곳, TSK-05-03 I19)
        LayoutDraftBuilder.Built built = draftBuilder.build(request, headers, consts, items, asOf, true);
        if (!built.issues().isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.MESSAGE_PREFIX, built.issues());
        }
        LayoutDraft d = built.draft();
        MdmLayout layout;
        BigDecimal ver;
        long rowVersion;
        if (built.target() == null) {
            // 등록 — 부모 CREATED + 1.000 MAJOR DRAFT(소유자 = 등록한 사람, 담당자 역할을 요구하지 않는다)
            layout = new MdmLayout(MESSAGE, d.layoutName());
            layout.setSndSystem(d.sndSystem());
            layout.setRcvSystem(d.rcvSystem());
            layout = writer.saveLayout(layout);
            ver = VersionNumbers.FIRST;
            MdmLayoutVer v = new MdmLayoutVer(layout.getLayoutId(), ver, VersionKind.MAJOR, me);
            v.setEaiCode(d.eaiCode());
            v.setOwnLength(d.ownLength());
            versionStore.save(v);
            rowVersion = VersionConventions.INITIAL_ROW_VERSION;
        } else {
            layout = built.target();
            ver = LayoutVersions.requireVer(request.getVer());
            // 소유자(MDM003)·row_version(MDM001)·DRAFT(MDM002)·다른 미적용(MDM007)
            rowVersion = writeGuard.beginDraftWrite(new VersionRef(VersionTarget.LAYOUT, String.valueOf(layout.getLayoutId()), ver),
                    LayoutVersions.requireRowVersion(request.getRowVersion()), me);
            MdmLayoutVer v = versionStore.find(layout.getLayoutId(), ver).orElseThrow();
            v.setEaiCode(d.eaiCode());
            v.setOwnLength(d.ownLength());
            versionStore.save(v);
            boolean parentChanged = !Objects.equals(layout.getLayoutName(), d.layoutName())
                    || !Objects.equals(layout.getSndSystem(), d.sndSystem()) || !Objects.equals(layout.getRcvSystem(), d.rcvSystem());
            layout.setLayoutName(d.layoutName());
            layout.setSndSystem(d.sndSystem());
            layout.setRcvSystem(d.rcvSystem());
            layout = writer.saveLayout(layout);
            // 메타 기록(spec 2026-10-02 §3.3) — DRAFT 저장은 피드 값을 바꾸지 않아 기록하지 않는다. 다만 부모 칸(이름·송수신 시스템, Ruling P3-8)은
            // 버전 무관이라 RELEASED 버전의 합성 스냅샷에도 실린다 — 바뀌었고 RELEASED 가 있을 때만 기록한다(바뀌지 않으면 조회도 하지 않는다)
            if (parentChanged && LayoutVersions.latestReleased(versionStore.versions(layout.getLayoutId())).isPresent()) {
                recorder.layouts(List.of(layout.getLayoutId()));
            }
        }
        Long id = layout.getLayoutId();
        BigDecimal key = ver;
        List<MdmLayoutConst> constRows = d.consts().stream()
                .map(c -> new MdmLayoutConst(id, key, c.headerLayoutId(), c.headerColumnPhys(), c.value())).toList();
        writer.replaceVersionRows(id, ver, d.headerIds(), constRows,
                LayoutRows.entities(id, ver, d.items(), d.itemLengths(), d.bodyOffsets()));
        int headerLength = d.headers().stream().mapToInt(LayoutSnapshotAssembler.HeaderPart::length).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", id);
        out.put("ver", VersionNumbers.plain(ver));
        out.put("rowVersion", rowVersion);
        out.put("ownLength", d.ownLength());
        out.put("headerLength", headerLength);
        out.put("totalLength", headerLength + d.ownLength());
        out.put("asOf", LayoutTimes.text(asOf));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate — 등록 검증 7종 표(TSK-05-03 §6.2). 쓰지 않는다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> validate(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                        List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        LayoutDraftBuilder.Built built = draftBuilder.build(request, headers, consts, items, asOf, true);
        LayoutCheckTable.Result r = LayoutCheckTable.build(built.issues(), built.warnings());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("checks", r.checks());
        out.put("otherIssues", r.otherIssues());
        out.put("passed", r.passed());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute — 예시 값 → 인코딩 바이트 기준 한 줄(TSK-05-03 D13). 판정 시각 T 의 헤더 버전. 쓰지 않는다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> execute(LayoutMngExecuteRequest request, List<Map<String, Object>> headers,
                                       List<Map<String, Object>> consts, List<Map<String, Object>> items,
                                       List<Map<String, Object>> samples) {
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        LayoutDraftBuilder.Built built = draftBuilder.build(request.toSaveRequest(), headers, consts, items, asOf, true);
        if (!built.issues().isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("issues", issueRows(built.issues()));
            return out;
        }
        BigDecimal ver = request.getVer() == null || request.getVer().isBlank() ? VersionNumbers.FIRST
                : LayoutVersions.requireVer(request.getVer());
        MdmLayoutSnapshot snapshot = assembler.fromDraft(built.draft(), ver, built.draft().headers());
        Map<String, String> values = new LinkedHashMap<>();
        for (Map<String, Object> row : samples == null ? List.<Map<String, Object>>of() : samples) {
            Object phys = row.get("COLUMN_PHYS");
            if (phys != null) {
                values.put(String.valueOf(phys), row.get("VALUE") == null ? null : String.valueOf(row.get("VALUE")));
            }
        }
        LocalDateTime sendTime = request.getSendTime() == null || request.getSendTime().isBlank() ? LocalDateTime.now(clock)
                : LocalDateTime.parse(request.getSendTime().trim(), SEND_TIME);
        Map<String, String> names = displayNames(snapshot);
        return renderer.render(snapshot, values, sendTime, request.getSeq() == null ? 1L : request.getSeq(), names::get);
    }

    // ────────────────────────────────────────────────────────────────
    // action: export — 시각 T 의 합성 스냅샷 JSON(파생·계산값이 풀려 들어간 배포 대상, html p-ver). 엑셀은 화면이 이 JSON 으로 만든다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> export(LayoutMngExportRequest request) {
        MdmLayout layout = message(request.getLayoutId());
        LocalDateTime asOf = LayoutTimes.asOf(request.getAsOf(), clock);
        MdmLayoutSnapshot snapshot = request.getVer() == null || request.getVer().isBlank()
                ? composer.at(layout.getLayoutId(), asOf)
                : composer.compose(layout.getLayoutId(), LayoutVersions.requireVer(request.getVer()), asOf);
        String ver = VersionNumbers.plain(snapshot.layoutVersion());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", layout.getLayoutId());
        out.put("ver", ver);
        out.put("asOf", LayoutTimes.text(asOf));
        out.put("fileBase", "layout-" + layout.getLayoutId() + "-v" + ver + "-" + LayoutTimes.text(asOf).replaceAll("[^0-9]", ""));
        out.put("snapshot", LayoutSnapshotJson.toMap(snapshot));
        out.put("names", displayNames(snapshot));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: copy / delete / lock / unlock / handover — 버전 조작(D-144 3단계). 공통 버전 서비스로만 한다(LayoutVersionService)
    // ────────────────────────────────────────────────────────────────

    /** 새 버전 — {@code verKind} 가 비면 MAJOR. 직전 RELEASED 의 항목·헤더 구성·재정의를 복사한다. */
    public LayoutVersionResult copy(LayoutVersionRequest request) {
        return versionService.newVersion(request, MESSAGE);
    }

    /** {@code target} CONFIRM 이면 확정 취소, VERSION(비면 기본)이면 DRAFT 삭제, 그 밖의 값은 INVALID_VALUE. */
    public LayoutVersionResult delete(LayoutVersionRequest request) {
        return versionService.delete(request, MESSAGE);
    }

    /** DRAFT 선점(담당자만) — 새 row_version. */
    public LayoutVersionResult lock(LayoutVersionRequest request) {
        return versionService.lock(request, MESSAGE);
    }

    /** DRAFT 해제(소유자만) — 새 row_version. */
    public LayoutVersionResult unlock(LayoutVersionRequest request) {
        return versionService.unlock(request, MESSAGE);
    }

    /** DRAFT 넘기기(소유자만, 받는 사람은 담당자) — 새 row_version. */
    public LayoutVersionResult handover(LayoutVersionRequest request) {
        return versionService.handover(request, MESSAGE);
    }

    /** 스냅샷에 쓰인 물리명 → 표시명(label_long ?? 논리명). */
    private Map<String, String> displayNames(MdmLayoutSnapshot snapshot) {
        List<String> phys = new ArrayList<>();
        for (MdmLayoutHeaderRef h : snapshot.headers()) {
            h.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        }
        snapshot.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, String> out = new LinkedHashMap<>();
        dictionary.byPhysNames(phys).forEach((k, c) -> out.put(k, c.displayName()));
        return out;
    }

    private static List<Map<String, Object>> issueRows(List<LayoutIssue> issues) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (LayoutIssue i : issues) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("CODE", i.code().name());
            m.put("SEQ", i.seq());
            m.put("FIELD", i.field());
            m.put("MESSAGE", i.message());
            out.add(m);
        }
        return out;
    }

    /** 목록이 기준으로 삼는 버전 — 지금 적용 중 RELEASED, 없으면 DRAFT, 그것도 없으면 가장 큰 버전. 버전이 없으면 null. */
    private static MdmLayoutVer shown(List<MdmLayoutVer> versions, LocalDateTime now) {
        return LayoutVersions.releasedAt(versions, now).or(() -> LayoutVersions.draft(versions))
                .orElseGet(() -> versions.isEmpty() ? null : versions.get(0));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
    }

    private MdmLayout message(Long layoutId) {
        MdmLayout layout = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (layout == null || !MESSAGE.equals(layout.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, MESSAGE);
        }
        return layout;
    }

    private static Map<String, Object> headerOption(MdmLayout h, int length) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("LAYOUT_ID", h.getLayoutId());
        row.put("LAYOUT_NAME", h.getLayoutName());
        row.put("TOTAL_LENGTH", length);
        return row;
    }
}
