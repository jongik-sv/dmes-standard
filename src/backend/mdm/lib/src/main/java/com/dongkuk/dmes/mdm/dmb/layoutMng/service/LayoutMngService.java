/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: layoutMng (전문 레이아웃) OASIS 서비스 — search / view / save / validate / execute / export 6 action
 */
package com.dongkuk.dmes.mdm.dmb.layoutMng.service;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCheckTable;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutImpactFinder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssueCode;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSampleRenderer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersioner;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExecuteRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExportRequest;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstResolver;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraft;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutOffsetCalculator;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * 전문 레이아웃({@code layoutMng}) OASIS 진입 서비스(TSK-05-02 design.md §6.1·§6.3).
 *
 * <p>BPMN {@code services/dmb/layoutMng.bpmn} 의 {@code actionGateway} 3 분기와 1:1 이다. 쓰기는 {@code save} 만 한다.
 * <b>{@code save} 에는 헤더 항목을 받는 입력이 없다</b> — 전문에서 헤더 구성·길이는 잠기고, 재정의는
 * {@code TB_MDM_LAYOUT_CONST} 에만 쓴다(불변 I8). EAI 를 고른 전문에는 그 EAI 표준 헤더가 헤더 구성 1번에 들어간다(I14).
 * 저장하면 그 자리에서 스냅샷 버전을 만든다(TSK-05-03 I15 — 05-02 I17 대체, D4). TSK-05-03 이 등록 검증 7종(validate)·샘플 전문
 * 렌더(execute)·스냅샷 출력(export)·영향 전문 목록(search target=IMPACT)을 더했다 — 넷 다 쓰지 않는다(I20).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다</b>(F11). 트랜잭션은 OASIS action 한 건이며, 쓰기 전에 모든 검사를 끝낸다.
 */
@Service("layoutMngService")
public class LayoutMngService {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";
    private static final String COLUMN = "COLUMN";
    private static final String IMPACT = "IMPACT";
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter SAVED_AT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(KST);
    private static final DateTimeFormatter SEND_TIME = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final LayoutDraftBuilder draftBuilder;
    private final LayoutVersioner versioner;
    private final LayoutVersionStore versionStore;
    private final LayoutSnapshotAssembler assembler;
    private final LayoutSampleRenderer renderer;
    private final LayoutImpactFinder impactFinder;

    public LayoutMngService(LayoutQueries queries, LayoutDictionary dictionary, LayoutWriter writer,
                            MdmLayoutRepository layoutRepository, LayoutDraftBuilder draftBuilder, LayoutVersioner versioner,
                            LayoutVersionStore versionStore, LayoutSnapshotAssembler assembler, LayoutSampleRenderer renderer,
                            LayoutImpactFinder impactFinder) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.draftBuilder = draftBuilder;
        this.versioner = versioner;
        this.versionStore = versionStore;
        this.assembler = assembler;
        this.renderer = renderer;
        this.impactFinder = impactFinder;
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
        List<MdmLayout> headerLayouts = queries.layoutsOfKind(HEADER);
        if (HEADER.equals(request.getTarget())) {
            // 헤더 추가 팝업 — 저장 전 전문에서도 상수 편집을 열 수 있게 헤더 항목(기본값·파생값)을 함께 준다
            List<MdmLayout> picked = headerLayouts.stream()
                    .filter(h -> LayoutRows.matches(h.getLayoutName(), request.getKeyword())).toList();
            // 항목·EAI 는 헤더 수와 무관하게 IN 으로 한 번씩 읽는다(헤더별 순서는 단건 조회와 같다 — 항목 SEQ 순, EAI 코드 순 첫 행)
            List<Long> pickedIds = picked.stream().map(MdmLayout::getLayoutId).toList();
            Map<Long, List<MdmLayoutItem>> items = queries.itemsOf(pickedIds);
            Map<Long, List<MdmEai>> eais = queries.eaisOfHeaders(pickedIds);
            List<String> phys = new ArrayList<>();
            for (MdmLayout h : picked) {
                items.getOrDefault(h.getLayoutId(), List.of()).stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull)
                        .forEach(phys::add);
            }
            Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
            List<Map<String, Object>> rows = new ArrayList<>();
            for (MdmLayout h : picked) {
                Map<String, Object> row = headerOption(h);
                row.put("EAI_CODE", eais.getOrDefault(h.getLayoutId(), List.of()).stream().map(MdmEai::getEaiCode).findFirst().orElse(null));
                row.put("items", LayoutRows.items(items.getOrDefault(h.getLayoutId(), List.of()), dict));
                rows.add(row);
            }
            out.put("headers", rows);
            return out;
        }
        List<Map<String, Object>> layouts = new ArrayList<>();
        if (!request.isOptionsOnly()) { // 진입 때 콤보 값만 — 전문 목록·헤더 스택·항목 수 집계를 하지 않는다.
            Map<Long, MdmLayout> headersById = new HashMap<>();
            for (MdmLayout h : headerLayouts) {
                headersById.put(h.getLayoutId(), h);
            }
            Map<Long, List<Long>> stacks = new HashMap<>();
            for (MdmLayoutHeader h : queries.allStacks()) {
                stacks.computeIfAbsent(h.getLayoutId(), k -> new ArrayList<>()).add(h.getHeaderLayoutId());
            }
            Map<Long, Long> itemCounts = new HashMap<>();
            for (Object[] r : queries.itemCounts()) {
                itemCounts.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
            }
            String snd = LayoutRows.text(request.getSndSystem());
            String rcv = LayoutRows.text(request.getRcvSystem());
            for (MdmLayout l : queries.layoutsOfKind(MESSAGE)) {
                List<Long> stack = stacks.getOrDefault(l.getLayoutId(), List.of());
                if (!LayoutRows.matches(l.getLayoutName(), request.getKeyword())
                        || (request.getHeaderLayoutId() != null && !stack.contains(request.getHeaderLayoutId()))
                        || (snd != null && !snd.equals(l.getSndSystem())) || (rcv != null && !rcv.equals(l.getRcvSystem()))) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("LAYOUT_ID", l.getLayoutId());
                row.put("LAYOUT_NAME", l.getLayoutName());
                row.put("EAI_CODE", l.getEaiCode());
                row.put("SND_SYSTEM", l.getSndSystem());
                row.put("RCV_SYSTEM", l.getRcvSystem());
                row.put("HEADER_SUMMARY", stack.stream().map(headersById::get).filter(Objects::nonNull)
                        .map(h -> h.getLayoutName() + " (" + h.getTotalLength() + ")").collect(Collectors.joining(" + ")));
                row.put("ITEM_COUNT", itemCounts.getOrDefault(l.getLayoutId(), 0L));
                row.put("TOTAL_LENGTH", l.getTotalLength());
                row.put("LAYOUT_VERSION", l.getLayoutVersion());
                row.put("VER", l.getVersion());
                layouts.add(row);
            }
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
        out.put("eais", queries.allEais().stream().map(LayoutRows::eaiRow).toList());
        out.put("headers", headerLayouts.stream().map(LayoutMngService::headerOption).toList());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 기본 속성·헤더 구성(헤더별 항목·실효값)·본문 항목
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(LayoutMngViewRequest request) {
        MdmLayout layout = message(request.getLayoutId());
        List<MdmLayoutHeader> stack = queries.headersOf(layout.getLayoutId());
        Map<String, String> overrides = new HashMap<>();
        for (MdmLayoutConst c : queries.constsOf(layout.getLayoutId())) {
            overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderSeq(), c.getConstValue());
        }
        List<MdmLayoutItem> body = queries.itemsOf(layout.getLayoutId());
        Map<Long, List<MdmLayoutItem>> headerItems = new LinkedHashMap<>();
        List<String> phys = new ArrayList<>();
        for (MdmLayoutHeader h : stack) {
            List<MdmLayoutItem> items = queries.itemsOf(h.getHeaderLayoutId());
            headerItems.put(h.getHeaderLayoutId(), items);
            items.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add);
        }
        body.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);

        List<Integer> totals = new ArrayList<>();
        List<MdmLayout> headerLayouts = new ArrayList<>();
        for (MdmLayoutHeader h : stack) {
            MdmLayout hl = layoutRepository.findById(h.getHeaderLayoutId()).orElse(null);
            headerLayouts.add(hl);
            totals.add(hl == null ? 0 : hl.getTotalLength());
        }
        LayoutOffsetCalculator.Placed placed = LayoutOffsetCalculator.placeHeader(totals);
        List<Map<String, Object>> headers = new ArrayList<>();
        for (int i = 0; i < stack.size(); i++) {
            MdmLayoutHeader h = stack.get(i);
            MdmLayout hl = headerLayouts.get(i);
            List<Map<String, Object>> items = new ArrayList<>();
            for (MdmLayoutItem it : headerItems.get(h.getHeaderLayoutId())) {
                Map<String, Object> row = LayoutRows.item(it, it.getColumnPhys() == null ? null : dict.get(it.getColumnPhys()));
                String override = overrides.get(h.getHeaderLayoutId() + ":" + it.getSeq());
                row.put("OVERRIDE_VALUE", override);
                row.put("EFFECTIVE_VALUE", LayoutConstResolver.effective(LayoutFillKinds.parse(it.getFillKind()),
                        it.getDefaultValue(), override));
                items.add(row);
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("SEQ", h.getSeq());
            row.put("HEADER_LAYOUT_ID", h.getHeaderLayoutId());
            row.put("HEADER_NAME", hl == null ? null : hl.getLayoutName());
            row.put("EAI_CODE", queries.eaiOfHeader(h.getHeaderLayoutId()).stream().map(MdmEai::getEaiCode).findFirst().orElse(null));
            row.put("TOTAL_LENGTH", totals.get(i));
            row.put("OFFSET", placed.offsets().get(i));
            row.put("items", items);
            headers.add(row);
        }
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("LAYOUT_ID", layout.getLayoutId());
        info.put("LAYOUT_NAME", layout.getLayoutName());
        info.put("EAI_CODE", layout.getEaiCode());
        info.put("SND_SYSTEM", layout.getSndSystem());
        info.put("RCV_SYSTEM", layout.getRcvSystem());
        info.put("TOTAL_LENGTH", layout.getTotalLength());
        info.put("HEADER_LENGTH", placed.total());
        info.put("LAYOUT_VERSION", layout.getLayoutVersion());
        info.put("VER", layout.getVersion());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layout", info);
        out.put("headers", headers);
        out.put("items", LayoutRows.items(body, dict));
        out.put("units", LayoutRows.units(queries.units()));
        out.put("versions", versions(layout.getLayoutId()));
        return out;
    }

    /** 버전 이력(최신부터) — 저장 일시·저장자는 감사 C_AT(KST)·C_USR_ID. */
    private List<Map<String, Object>> versions(Long layoutId) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (MdmLayoutVer v : versionStore.history(layoutId)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_VERSION", v.getLayoutVersion());
            row.put("SAVED_AT", v.getCreatedAt() == null ? null : SAVED_AT.format(v.getCreatedAt()));
            row.put("SAVED_BY", v.getCreatedBy());
            row.put("TOTAL_LENGTH", v.getTotalLength());
            row.put("SWITCH_MODE", v.getSwitchMode());
            row.put("CHANGE_KINDS", v.getChangeKinds());
            row.put("CHANGE_SUMMARY", v.getChangeSummary());
            rows.add(row);
        }
        return rows;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 기본 속성(L11) → 헤더 구성(L09) → 재정의(L10) → 본문(L01~L08) → 계산 → 쓰기(§6.3)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                    List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        // ①~⑤ 대상·동시 수정 → 검사 → 길이·배치(LayoutDraftBuilder 한 곳, TSK-05-03 I19)
        LayoutDraftBuilder.Built built = draftBuilder.build(request, headers, consts, items, true);
        if (!built.issues().isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.MESSAGE_PREFIX, built.issues());
        }
        LayoutDraft d = built.draft();
        LayoutOffsetCalculator.Stacked s = d.placed();
        // ⑥ 전문 행
        MdmLayout layout = built.target() == null ? new MdmLayout(MESSAGE, d.layoutName()) : built.target();
        layout.setLayoutName(d.layoutName());
        layout.setEaiCode(d.eaiCode());
        layout.setSndSystem(d.sndSystem());
        layout.setRcvSystem(d.rcvSystem());
        layout.setTotalLength(s.total());
        layout = writer.saveLayout(layout);
        Long messageId = layout.getLayoutId();
        // ⑦ 헤더 적층·재정의 ⑧ 본문 항목
        List<MdmLayoutConst> constRows = new ArrayList<>();
        for (LayoutDraft.ConstRow c : d.consts()) {
            constRows.add(new MdmLayoutConst(messageId, c.headerLayoutId(), c.headerSeq(), c.value()));
        }
        writer.replaceStack(messageId, d.headerIds(), constRows);
        writer.replaceItems(messageId, LayoutRows.entities(messageId, d.items(), d.itemLengths(), s.bodyOffsets()));
        // ⑨ 스냅샷 버전 — 바뀌었을 때만(I15). 응답 ver 는 버전을 올린 뒤의 감사 VER(I16)
        LayoutVersioner.Outcome v = versioner.record(messageId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", messageId);
        out.put("ver", v.ver());
        out.put("totalLength", s.total());
        out.put("headerLength", s.headerLength());
        out.put("layoutVersion", v.layoutVersion());
        out.put("versionCreated", v.created());
        out.put("switchMode", v.switchMode());
        out.put("changeSummary", v.changeSummary());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: validate — 등록 검증 7종 표(TSK-05-03 §6.2). 쓰지 않는다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> validate(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                        List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        LayoutDraftBuilder.Built built = draftBuilder.build(request, headers, consts, items, false);
        LayoutCheckTable.Result r = LayoutCheckTable.build(built.issues(), built.warnings());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("checks", r.checks());
        out.put("otherIssues", r.otherIssues());
        out.put("passed", r.passed());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: execute — 예시 값 → 인코딩 바이트 기준 한 줄(TSK-05-03 D13). 쓰지 않는다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> execute(LayoutMngExecuteRequest request, List<Map<String, Object>> headers,
                                       List<Map<String, Object>> consts, List<Map<String, Object>> items,
                                       List<Map<String, Object>> samples) {
        LayoutDraftBuilder.Built built = draftBuilder.build(request.toSaveRequest(), headers, consts, items, false);
        if (!built.issues().isEmpty()) {
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("issues", issueRows(built.issues()));
            return out;
        }
        MdmLayoutSnapshot snapshot = assembler.fromDraft(built.draft());
        Map<String, String> values = new LinkedHashMap<>();
        for (Map<String, Object> row : samples == null ? List.<Map<String, Object>>of() : samples) {
            Object phys = row.get("COLUMN_PHYS");
            if (phys != null) {
                values.put(String.valueOf(phys), row.get("VALUE") == null ? null : String.valueOf(row.get("VALUE")));
            }
        }
        LocalDateTime sendTime = request.getSendTime() == null || request.getSendTime().isBlank() ? LocalDateTime.now(KST)
                : LocalDateTime.parse(request.getSendTime().trim(), SEND_TIME);
        Map<String, String> names = displayNames(snapshot);
        return renderer.render(snapshot, values, sendTime, request.getSeq() == null ? 1L : request.getSeq(), names::get);
    }

    // ────────────────────────────────────────────────────────────────
    // action: export — 스냅샷 JSON(파생·계산값이 풀려 들어간 배포 대상, html p-ver). 엑셀은 화면이 이 JSON 으로 만든다
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> export(LayoutMngExportRequest request) {
        MdmLayout layout = message(request.getLayoutId());
        Optional<MdmLayoutVer> v = request.getLayoutVersion() == null ? versionStore.latest(layout.getLayoutId())
                : versionStore.find(layout.getLayoutId(), request.getLayoutVersion());
        if (v.isEmpty()) {
            throw LayoutRejections.reject(EXPORT_PREFIX, LayoutIssue.of(LayoutIssueCode.L11, null, "LAYOUT_VERSION",
                    "저장된 버전이 없습니다: " + layout.getLayoutId() + (request.getLayoutVersion() == null ? "" : " v" + request.getLayoutVersion())));
        }
        MdmLayoutSnapshot snapshot = LayoutSnapshotJson.read(v.get().getSnapshotJson());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", layout.getLayoutId());
        out.put("layoutVersion", v.get().getLayoutVersion());
        out.put("fileBase", "layout-" + layout.getLayoutId() + "-v" + v.get().getLayoutVersion());
        out.put("snapshot", LayoutSnapshotJson.toMap(snapshot));
        out.put("names", displayNames(snapshot));
        return out;
    }

    private static final String EXPORT_PREFIX = "스냅샷 출력 거부: ";

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

    private MdmLayout message(Long layoutId) {
        MdmLayout layout = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (layout == null || !MESSAGE.equals(layout.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, MESSAGE);
        }
        return layout;
    }

    private static Map<String, Object> headerOption(MdmLayout h) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("LAYOUT_ID", h.getLayoutId());
        row.put("LAYOUT_NAME", h.getLayoutName());
        row.put("TOTAL_LENGTH", h.getTotalLength());
        return row;
    }
}
