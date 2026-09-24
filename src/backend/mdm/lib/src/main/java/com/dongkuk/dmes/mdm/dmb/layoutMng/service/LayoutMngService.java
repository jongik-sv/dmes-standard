/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: layoutMng (전문 레이아웃) OASIS 서비스 — search / view / save 3 action
 */
package com.dongkuk.dmes.mdm.dmb.layoutMng.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstResolver;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutFillKinds;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssueCode;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemDraft;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemRules;
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
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * 전문 레이아웃({@code layoutMng}) OASIS 진입 서비스(TSK-05-02 design.md §6.1·§6.3).
 *
 * <p>BPMN {@code services/dmb/layoutMng.bpmn} 의 {@code actionGateway} 3 분기와 1:1 이다. 쓰기는 {@code save} 만 한다.
 * <b>{@code save} 에는 헤더 항목을 받는 입력이 없다</b> — 전문에서 헤더 구성·길이는 잠기고, 재정의는
 * {@code TB_MDM_LAYOUT_CONST} 에만 쓴다(불변 I8). EAI 를 고른 전문에는 그 EAI 표준 헤더가 헤더 구성 1번에 들어간다(I14).
 * 업무 버전({@code VERSION})은 올리지 않는다(I17, 05-03 몫).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다</b>(F11). 트랜잭션은 OASIS action 한 건이며, 쓰기 전에 모든 검사를 끝낸다.
 */
@Service("layoutMngService")
public class LayoutMngService {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";
    private static final String COLUMN = "COLUMN";

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;

    public LayoutMngService(LayoutQueries queries, LayoutDictionary dictionary, LayoutWriter writer,
                            MdmLayoutRepository layoutRepository, MdmEaiRepository eaiRepository) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — target LAYOUT(기본) 전문 목록 · HEADER 헤더 선택 · COLUMN 컬럼 사전 검색(D8)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> search(LayoutMngSearchRequest request) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (COLUMN.equals(request.getTarget())) {
            out.put("columns", dictionary.search(request.getKeyword()).stream().map(LayoutColumnInfo::toRow).toList());
            return out;
        }
        List<MdmLayout> headerLayouts = queries.layoutsOfKind(HEADER);
        if (HEADER.equals(request.getTarget())) {
            // 헤더 추가 팝업 — 저장 전 전문에서도 상수 편집을 열 수 있게 헤더 항목(기본값·파생값)을 함께 준다
            List<MdmLayout> picked = headerLayouts.stream()
                    .filter(h -> LayoutRows.matches(h.getLayoutName(), request.getKeyword())).toList();
            Map<Long, List<MdmLayoutItem>> items = new LinkedHashMap<>();
            List<String> phys = new ArrayList<>();
            for (MdmLayout h : picked) {
                List<MdmLayoutItem> list = queries.itemsOf(h.getLayoutId());
                items.put(h.getLayoutId(), list);
                list.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).forEach(phys::add);
            }
            Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(phys);
            List<Map<String, Object>> rows = new ArrayList<>();
            for (MdmLayout h : picked) {
                Map<String, Object> row = headerOption(h);
                row.put("EAI_CODE", queries.eaiOfHeader(h.getLayoutId()).stream().map(MdmEai::getEaiCode).findFirst().orElse(null));
                row.put("items", LayoutRows.items(items.get(h.getLayoutId()), dict));
                rows.add(row);
            }
            out.put("headers", rows);
            return out;
        }
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
        List<Map<String, Object>> layouts = new ArrayList<>();
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
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 기본 속성(L11) → 헤더 구성(L09) → 재정의(L10) → 본문(L01~L08) → 계산 → 쓰기(§6.3)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(LayoutMngSaveRequest request, List<Map<String, Object>> headers,
                                    List<Map<String, Object>> consts, List<Map<String, Object>> items) {
        // ① 대상·동시 수정
        MdmLayout layout = null;
        if (request.getLayoutId() != null) {
            layout = message(request.getLayoutId());
            if (!Objects.equals(request.getVer(), layout.getVersion())) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
        }
        List<LayoutIssue> issues = new ArrayList<>();
        String name = LayoutRows.text(request.getLayoutName());
        String eaiCode = LayoutRows.text(request.getEaiCode());
        String snd = LayoutRows.text(request.getSndSystem());
        String rcv = LayoutRows.text(request.getRcvSystem());
        if (name == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "LAYOUT_NAME", "전문 이름이 비었다"));
        }
        Set<Object> systems = queries.systems().stream().map(r -> r[0]).collect(Collectors.toSet());
        if (snd == null || !systems.contains(snd)) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "SND_SYSTEM", "송신 시스템이 없다: " + snd));
        }
        if (rcv == null || !systems.contains(rcv)) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "RCV_SYSTEM", "수신 시스템이 없다: " + rcv));
        }
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        if (eaiCode != null && eai == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "EAI_CODE", "EAI 가 없다: " + eaiCode));
        }
        // ② 헤더 구성 — EAI 표준 헤더가 없으면 맨 앞에 끼운다(I14)
        List<Long> headerIds = new ArrayList<>();
        for (Map<String, Object> row : headers == null ? List.<Map<String, Object>>of() : headers) {
            headerIds.add(LayoutRows.id(row.get("HEADER_LAYOUT_ID")));
        }
        if (eai != null && eai.getHeaderLayoutId() != null && !headerIds.contains(eai.getHeaderLayoutId())) {
            headerIds.add(0, eai.getHeaderLayoutId());
        }
        List<MdmLayout> headerLayouts = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (int i = 0; i < headerIds.size(); i++) {
            Long id = headerIds.get(i);
            MdmLayout h = id == null ? null : layoutRepository.findById(id).orElse(null);
            if (h == null || !HEADER.equals(h.getLayoutKind())) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L09, i + 1, "HEADER_LAYOUT_ID", "헤더 레이아웃이 아니다: " + id));
            } else if (!seen.add(id)) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L09, i + 1, "HEADER_LAYOUT_ID", "같은 헤더를 두 번 쌓을 수 없다: " + id));
            }
            headerLayouts.add(h);
        }
        // ③ 재정의 — 이 전문에 쌓인 헤더의 CONST 항목만. 빈 값은 "재정의 없음"(I10)
        List<long[]> constKeys = new ArrayList<>();
        List<String> constValues = new ArrayList<>();
        Map<Long, Map<Integer, MdmLayoutItem>> itemsByHeader = new HashMap<>();
        for (Map<String, Object> row : consts == null ? List.<Map<String, Object>>of() : consts) {
            String value = row.get("CONST_VALUE") == null ? null : LayoutRows.text(String.valueOf(row.get("CONST_VALUE")));
            if (value == null) {
                continue;
            }
            Long headerId = LayoutRows.id(row.get("HEADER_LAYOUT_ID"));
            Long seqValue = LayoutRows.id(row.get("HEADER_SEQ"));
            if (headerId == null || seqValue == null || !seen.contains(headerId)) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L10, null, "HEADER_LAYOUT_ID",
                        "이 전문에 쌓이지 않은 헤더의 상수는 재정의할 수 없다: " + headerId));
                continue;
            }
            MdmLayoutItem target = itemsByHeader.computeIfAbsent(headerId, this::itemsBySeq).get(seqValue.intValue());
            if (target == null || !MdmFillKind.CONST.name().equals(target.getFillKind())) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L10, seqValue.intValue(), "HEADER_SEQ",
                        "CONST 항목만 재정의할 수 있다: 헤더 " + headerId + " 항목 " + seqValue
                                + (target == null ? "(없음)" : "(" + target.getFillKind() + ")")));
                continue;
            }
            constKeys.add(new long[] {headerId, seqValue});
            constValues.add(value);
        }
        // ④ 본문 항목
        List<LayoutItemDraft> drafts = LayoutRows.drafts(items);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(LayoutRows.physNames(drafts));
        issues.addAll(LayoutItemRules.check(drafts, dict));
        if (!issues.isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.MESSAGE_PREFIX, issues);
        }
        // ⑤ 계산 — 헤더 길이는 저장된 헤더 TOTAL_LENGTH 그대로(헤더는 쓰지 않는다, I8)
        List<Integer> lengths = LayoutRows.lengths(drafts, dict);
        LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(
                headerLayouts.stream().map(MdmLayout::getTotalLength).toList(), lengths);
        // ⑥ 전문 행
        if (layout == null) {
            layout = new MdmLayout(MESSAGE, name);
        }
        layout.setLayoutName(name);
        layout.setEaiCode(eaiCode);
        layout.setSndSystem(snd);
        layout.setRcvSystem(rcv);
        layout.setTotalLength(s.total());
        layout = writer.saveLayout(layout);
        Long messageId = layout.getLayoutId();
        // ⑦ 헤더 적층·재정의 ⑧ 본문 항목
        List<MdmLayoutConst> constRows = new ArrayList<>();
        Map<String, Integer> index = new HashMap<>();
        for (int i = 0; i < constKeys.size(); i++) {
            long[] k = constKeys.get(i);
            String key = k[0] + ":" + k[1];
            MdmLayoutConst c = new MdmLayoutConst(messageId, k[0], (int) k[1], constValues.get(i));
            if (index.containsKey(key)) {
                constRows.set(index.get(key), c);
            } else {
                index.put(key, constRows.size());
                constRows.add(c);
            }
        }
        writer.replaceStack(messageId, headerIds, constRows);
        writer.replaceItems(messageId, LayoutRows.entities(messageId, drafts, lengths, s.bodyOffsets()));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", messageId);
        out.put("ver", layout.getVersion());
        out.put("totalLength", s.total());
        out.put("headerLength", s.headerLength());
        return out;
    }

    private Map<Integer, MdmLayoutItem> itemsBySeq(Long headerId) {
        Map<Integer, MdmLayoutItem> out = new HashMap<>();
        for (MdmLayoutItem i : queries.itemsOf(headerId)) {
            out.put(i.getSeq(), i);
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
