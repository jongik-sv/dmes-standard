/*
 * 작성자: Agent
 * 작성일: 2026-09-24
 * 내용: headerMng (전문 헤더 정의) OASIS 서비스 — search / view / save 3 action
 */
package com.dongkuk.dmes.mdm.dmb.headerMng.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
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
import com.dongkuk.dmes.mdm.dmb.layout.LayoutOffsetCalculator;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRegistrationRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersioner;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutWriter;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

/**
 * 전문 헤더 정의({@code headerMng}) OASIS 진입 서비스(TSK-05-02 design.md §6.1·§6.3).
 *
 * <p>BPMN {@code services/dmb/headerMng.bpmn} 의 {@code actionGateway} 3 분기와 1:1 이다. 쓰기는 {@code save} 만 한다.
 * 헤더 항목 오프셋은 그 헤더 안 상대값이고(F8), 헤더 저장은 그 헤더를 쌓은 전문 전체의 오프셋·총 길이를 같은 트랜잭션에서
 * 다시 계산하며, 재정의는 물리명으로 다시 짝짓는다(D7 — 불변 I12·I13). 인코딩·패딩은 EAI 소유라 EAI 행을 함께 쓴다(D2).
 * TSK-05-03 이 헤더 항목에도 03 등록 거부 #2·#3·#4·#7(L12~L15)을 걸고, 다시 계산한 사용 전문마다 같은 action 에서 스냅샷 버전을
 * 기록한다(TSK-05-03 I18 — 응답 {@code versioned}).
 *
 * <p><b>{@code @Transactional} 을 붙이지 않는다</b> — CGLIB 프록시가 파라미터 이름을 잃어 OASIS 바인딩이 죽는다(F11). 트랜잭션은
 * OASIS action 한 건이며, 쓰기 전에 모든 검사를 끝낸다.
 */
@Service("headerMngService")
public class HeaderMngService {

    private static final String HEADER = "HEADER";
    private static final String COLUMN = "COLUMN";

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutWriter writer;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;
    private final LayoutConstJudge constJudge;
    private final LayoutCodecs codecs;
    private final LayoutVersioner versioner;

    public HeaderMngService(LayoutQueries queries, LayoutDictionary dictionary, LayoutWriter writer,
                            MdmLayoutRepository layoutRepository, MdmEaiRepository eaiRepository, LayoutConstJudge constJudge,
                            LayoutCodecs codecs, LayoutVersioner versioner) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.writer = writer;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
        this.constJudge = constJudge;
        this.codecs = codecs;
        this.versioner = versioner;
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
        if (request.isOptionsOnly()) {
            // 진입 때 콤보 값만 — 헤더 목록·항목 수·사용 전문 집계를 하지 않는다.
            out.put("headers", new ArrayList<Map<String, Object>>());
            out.put("eais", eais.stream().map(LayoutRows::eaiRow).toList());
            return out;
        }
        Map<Long, Long> itemCounts = new HashMap<>();
        for (Object[] r : queries.itemCounts()) {
            itemCounts.put(((Number) r[0]).longValue(), ((Number) r[1]).longValue());
        }
        Map<Long, Integer> usedBy = new HashMap<>();
        for (MdmLayoutHeader h : queries.allStacks()) {
            usedBy.merge(h.getHeaderLayoutId(), 1, Integer::sum);
        }
        List<Map<String, Object>> headers = new ArrayList<>();
        for (MdmLayout l : queries.layoutsOfKind(HEADER)) {
            if (!LayoutRows.matches(l.getLayoutName(), request.getKeyword())) {
                continue;
            }
            MdmEai eai = eais.stream().filter(e -> Objects.equals(e.getHeaderLayoutId(), l.getLayoutId())).findFirst().orElse(null);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", l.getLayoutId());
            row.put("LAYOUT_NAME", l.getLayoutName());
            row.put("EAI_CODE", eai == null ? null : eai.getEaiCode());
            row.put("ENCODING", eai == null ? null : eai.getEncoding());
            row.put("ITEM_COUNT", itemCounts.getOrDefault(l.getLayoutId(), 0L));
            row.put("TOTAL_LENGTH", l.getTotalLength());
            row.put("USED_BY_COUNT", usedBy.getOrDefault(l.getLayoutId(), 0));
            row.put("VER", l.getVersion());
            headers.add(row);
        }
        out.put("headers", headers);
        out.put("eais", eais.stream().map(LayoutRows::eaiRow).toList());
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: view — 헤더 상세·항목(파생값)·사용 전문 영향도
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> view(HeaderMngViewRequest request) {
        MdmLayout layout = header(request.getLayoutId());
        MdmEai eai = queries.eaiOfHeader(layout.getLayoutId()).stream().findFirst().orElse(null);
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("LAYOUT_ID", layout.getLayoutId());
        header.put("LAYOUT_NAME", layout.getLayoutName());
        header.put("EAI_CODE", eai == null ? null : eai.getEaiCode());
        header.put("EAI_NAME", eai == null ? null : eai.getEaiName());
        header.put("ENCODING", eai == null ? null : eai.getEncoding());
        header.put("PAD_RULE", eai == null ? null : eai.getPadRule());
        header.put("TOTAL_LENGTH", layout.getTotalLength());
        header.put("VER", layout.getVersion());
        List<MdmLayoutItem> items = queries.itemsOf(layout.getLayoutId());
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(
                items.stream().map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).toList());
        List<Map<String, Object>> usedBy = new ArrayList<>();
        List<MdmLayoutHeader> stacks = queries.stacksUsing(layout.getLayoutId());
        Map<Long, MdmLayout> messages = new HashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(stacks.stream().map(MdmLayoutHeader::getLayoutId).toList())) {
            layoutRepository.findAllById(chunk).forEach(m -> messages.put(m.getLayoutId(), m));
        }
        for (MdmLayoutHeader h : stacks) {
            MdmLayout msg = messages.get(h.getLayoutId());
            if (msg == null) {
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", msg.getLayoutId());
            row.put("LAYOUT_NAME", msg.getLayoutName());
            row.put("SND_SYSTEM", msg.getSndSystem());
            row.put("RCV_SYSTEM", msg.getRcvSystem());
            row.put("HEADER_SEQ", h.getSeq());
            row.put("TOTAL_LENGTH", msg.getTotalLength());
            usedBy.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("header", header);
        out.put("items", LayoutRows.items(items, dict));
        out.put("usedBy", usedBy);
        out.put("units", LayoutRows.units(queries.units()));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — 검사 → 헤더·EAI → 재정의 보관 → 항목 교체 → 재정의 재짝짓기 → 사용 전문 재계산(§6.3)
    // ────────────────────────────────────────────────────────────────

    public Map<String, Object> save(HeaderMngSaveRequest request, List<Map<String, Object>> items) {
        List<LayoutItemDraft> drafts = LayoutRows.drafts(items);
        // ② 대상·동시 수정
        MdmLayout layout = null;
        if (request.getLayoutId() != null) {
            layout = header(request.getLayoutId());
            if (!Objects.equals(request.getVer(), layout.getVersion())) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
        }
        // ③ 기본 속성(L11) + 항목(L01~L08) — 하나라도 있으면 쓰기 전에 거부
        String name = LayoutRows.text(request.getLayoutName());
        String eaiCode = LayoutRows.text(request.getEaiCode());
        List<LayoutIssue> issues = new ArrayList<>();
        if (name == null) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "LAYOUT_NAME", "헤더 이름이 비었다"));
        }
        MdmEai eai = eaiCode == null ? null : eaiRepository.findById(eaiCode).orElse(null);
        if (eaiCode != null && eai == null
                && (LayoutRows.text(request.getEaiName()) == null || LayoutRows.text(request.getEncoding()) == null)) {
            issues.add(LayoutIssue.of(LayoutIssueCode.L11, null, "EAI_CODE", "새 EAI 에는 이름과 인코딩이 필요하다: " + eaiCode));
        }
        // 컬럼 사전·도메인 트리는 이 요청에서 한 번씩만 읽는다 — 헤더 저장은 사전·도메인을 고치지 않는다(검사·사용 전문 버전 기록이 같이 쓴다).
        LayoutDictionary.Cache cache = dictionary.cache();
        Map<String, LayoutColumnInfo> dict = cache.byPhysNames(LayoutRows.physNames(drafts));
        issues.addAll(LayoutItemRules.check(drafts, dict));
        // 03 등록 거부 #2·#3·#4·#7(TSK-05-03 L12~L15) — 헤더 인코딩: 요청 → 이 헤더를 가리키는 EAI → 고른 EAI → UTF-8
        issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(), LayoutDraftBuilder.charset(encoding(request, layout, eai)),
                LayoutDraftBuilder.lengthsBySeq(drafts, dict), constJudge.forColumns(LayoutRows.physNames(drafts), cache), new ArrayList<>()));
        if (!issues.isEmpty()) {
            throw LayoutRejections.reject(LayoutRejections.HEADER_PREFIX, issues);
        }
        // ④ 길이·상대 오프셋
        List<Integer> lengths = LayoutRows.lengths(drafts, dict);
        LayoutOffsetCalculator.Placed placed = LayoutOffsetCalculator.placeHeader(lengths);
        // ⑤ 헤더 행
        if (layout == null) {
            layout = new MdmLayout(HEADER, name);
        }
        layout.setLayoutName(name);
        layout.setTotalLength(placed.total());
        layout = writer.saveLayout(layout);
        Long headerId = layout.getLayoutId();
        // ⑥ EAI — 이 헤더를 표준 헤더로 가리키는 EAI 는 하나다
        for (MdmEai other : queries.eaiOfHeader(headerId)) {
            if (!other.getEaiCode().equals(eaiCode)) {
                other.setHeaderLayoutId(null);
                eaiRepository.saveAndFlush(other);
            }
        }
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
            eai.setHeaderLayoutId(headerId);
            eaiRepository.saveAndFlush(eai);
        }
        // ⑦ 재정의 보관(전문, 옛 물리명, 값) — CONST 가 헤더 항목을 FK 로 가리키므로 먼저 지운다
        Map<Integer, String> oldPhys = new HashMap<>();
        for (MdmLayoutItem i : queries.itemsOf(headerId)) {
            oldPhys.put(i.getSeq(), i.getColumnPhys());
        }
        List<MdmLayoutConst> oldConsts = queries.constsOfHeader(headerId);
        writer.deleteConsts(oldConsts);
        // ⑧ 항목 교체
        writer.replaceItems(headerId, LayoutRows.entities(headerId, drafts, lengths, placed.offsets()));
        // ⑨ 같은 물리명·CONST 인 새 순번으로 다시 넣는다. 짝이 없으면 버린다
        Map<String, Integer> constSeqByPhys = new HashMap<>();
        for (LayoutItemDraft d : drafts) {
            if (MdmFillKind.CONST.name().equals(d.fillKind()) && d.columnPhys() != null) {
                constSeqByPhys.put(d.columnPhys(), d.seq());
            }
        }
        List<MdmLayoutConst> repaired = new ArrayList<>();
        int dropped = 0;
        for (MdmLayoutConst c : oldConsts) {
            String phys = oldPhys.get(c.getHeaderSeq());
            Integer seq = phys == null ? null : constSeqByPhys.get(phys);
            if (seq == null) {
                dropped++;
            } else {
                repaired.add(new MdmLayoutConst(c.getLayoutId(), headerId, seq, c.getConstValue()));
            }
        }
        writer.insertConsts(repaired);
        // ⑩ 사용 전문 재계산
        List<Map<String, Object>> recalculated = writer.recalculateUsers(headerId);
        // ⑪ 사용 전문마다 스냅샷 버전(TSK-05-03 I18) — 스냅샷이 바뀐 전문만 새 버전이 생긴다. 원장은 재계산 쓰기(flush) 뒤에 한 번에 읽는다
        List<LayoutVersioner.Outcome> outcomes = versioner.recordAll(
                recalculated.stream().map(r -> ((Number) r.get("LAYOUT_ID")).longValue()).toList(), cache);
        List<Map<String, Object>> versioned = new ArrayList<>();
        for (int i = 0; i < recalculated.size(); i++) {
            Map<String, Object> r = recalculated.get(i);
            LayoutVersioner.Outcome o = outcomes.get(i);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("LAYOUT_ID", r.get("LAYOUT_ID"));
            row.put("LAYOUT_VERSION", o.layoutVersion());
            row.put("SWITCH_MODE", o.switchMode());
            row.put("CREATED", o.created());
            versioned.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("layoutId", headerId);
        out.put("ver", layout.getVersion());
        out.put("totalLength", placed.total());
        out.put("recalculated", recalculated);
        out.put("droppedOverrides", dropped);
        out.put("versioned", versioned);
        return out;
    }

    private String encoding(HeaderMngSaveRequest request, MdmLayout layout, MdmEai chosen) {
        String requested = LayoutRows.text(request.getEncoding());
        if (requested != null) {
            return requested;
        }
        if (layout != null) {
            MdmEai own = queries.eaiOfHeader(layout.getLayoutId()).stream().findFirst().orElse(null);
            if (own != null) {
                return own.getEncoding();
            }
        }
        return chosen == null ? null : chosen.getEncoding();
    }

    private MdmLayout header(Long layoutId) {
        MdmLayout layout = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (layout == null || !HEADER.equals(layout.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, HEADER);
        }
        return layout;
    }
}
