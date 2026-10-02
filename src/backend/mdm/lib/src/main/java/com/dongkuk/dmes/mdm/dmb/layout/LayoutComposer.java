package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshotResolver;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 시각 T 합성(D-144 K1) — 전문 버전 하나 + 그 버전이 쌓은 헤더마다 T 에 유효한 RELEASED 버전. 상수 재정의는 헤더 항목 물리명으로
 * 짝짓는다. LEGACY 버전(이행 전 이력)은 저장된 합성 스냅샷을 그대로 돌려준다(스펙 §7 이행 한계).
 */
@Component
public class LayoutComposer implements MdmLayoutSnapshotResolver {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";

    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutSnapshotAssembler assembler;
    private final MdmLayoutRepository layoutRepository;

    public LayoutComposer(LayoutVersionStore store, LayoutQueries queries, LayoutSnapshotAssembler assembler,
                          MdmLayoutRepository layoutRepository) {
        this.store = store;
        this.queries = queries;
        this.assembler = assembler;
        this.layoutRepository = layoutRepository;
    }

    /** 재정의 대상이 그 시각의 헤더 버전에 CONST 항목으로 없을 때 — 직렬화는 헤더 기본값을 쓴다. 헤더 확정 화면이 경고로 보인다. */
    public record OrphanOverride(long headerLayoutId, String headerColumnPhys, String value) {
    }

    public record Composition(MdmLayoutSnapshot snapshot, List<OrphanOverride> orphans) {
    }

    @Override
    public MdmLayoutSnapshot at(long layoutId, LocalDateTime asOf) {
        MdmLayoutVer v = LayoutVersions.releasedAt(store.versions(layoutId), asOf)
                .orElseThrow(() -> LayoutRejections.noReleased(layoutId, MESSAGE, asOf));
        return compose(layoutId, v.getVer(), asOf);
    }

    public MdmLayoutSnapshot compose(long messageId, BigDecimal ver, LocalDateTime asOf) {
        return composeDetailed(messageId, ver, asOf, Map.of()).snapshot();
    }

    /** headerPins 에 있는 헤더는 시각과 무관하게 그 버전을 쓴다(헤더 확정 영향도 — 확정 전 DRAFT 로 합성). */
    public Composition composeDetailed(long messageId, BigDecimal ver, LocalDateTime asOf, Map<Long, BigDecimal> headerPins) {
        MdmLayout layout = layoutRepository.findById(messageId).filter(l -> MESSAGE.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(messageId, MESSAGE));
        MdmLayoutVer v = store.find(messageId, ver).orElseThrow(() -> LayoutRejections.noVersion(messageId, ver));
        if (v.isLegacySnapshot()) {
            return new Composition(LayoutSnapshotJson.read(v.getSnapshotJson()), List.of());
        }
        List<LayoutSnapshotAssembler.HeaderPart> parts = new ArrayList<>();
        Map<Long, Set<String>> constPhysByHeader = new HashMap<>();
        for (MdmLayoutHeader h : queries.headersOf(messageId, v.getVer())) {
            long hid = h.getHeaderLayoutId();
            MdmLayoutVer hv = headerPins.containsKey(hid)
                    ? store.find(hid, headerPins.get(hid)).orElseThrow(() -> LayoutRejections.noVersion(hid, headerPins.get(hid)))
                    : headerAt(hid, asOf).orElseThrow(() -> LayoutRejections.noReleased(hid, HEADER, asOf));
            MdmLayout hl = layoutRepository.findById(hid).orElseThrow(() -> LayoutRejections.notFound(hid, HEADER));
            List<MdmLayoutItem> items = queries.itemsOf(hid, hv.getVer());
            constPhysByHeader.put(hid, items.stream().filter(i -> MdmFillKind.CONST.name().equals(i.getFillKind()))
                    .map(MdmLayoutItem::getColumnPhys).filter(Objects::nonNull).collect(Collectors.toSet()));
            parts.add(new LayoutSnapshotAssembler.HeaderPart(hid, hl.getLayoutName(), hv.getVer(), hv.getOwnLength(), items));
        }
        Map<String, String> overrides = new HashMap<>();
        List<OrphanOverride> orphans = new ArrayList<>();
        for (MdmLayoutConst c : queries.constsOf(messageId, v.getVer())) {
            if (constPhysByHeader.getOrDefault(c.getHeaderLayoutId(), Set.of()).contains(c.getHeaderColumnPhys())) {
                overrides.put(c.getHeaderLayoutId() + ":" + c.getHeaderColumnPhys(), c.getConstValue());
            } else {
                orphans.add(new OrphanOverride(c.getHeaderLayoutId(), c.getHeaderColumnPhys(), c.getConstValue()));
            }
        }
        MdmLayoutSnapshot s = assembler.assemble(new LayoutSnapshotAssembler.MessagePart(messageId, layout.getLayoutName(), v.getVer(),
                v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(), queries.itemsOf(messageId, v.getVer())),
                parts, overrides);
        return new Composition(s, List.copyOf(orphans));
    }

    /** 헤더 한 버전을 헤더 없는 전문처럼 — 헤더 확정의 변경 분류 입력(항목은 본문 자리, 헤더 안 상대 오프셋 = 절대). */
    public MdmLayoutSnapshot headerAlone(long headerId, BigDecimal ver) {
        MdmLayout hl = layoutRepository.findById(headerId).filter(l -> HEADER.equals(l.getLayoutKind()))
                .orElseThrow(() -> LayoutRejections.notFound(headerId, HEADER));
        MdmLayoutVer hv = store.find(headerId, ver).orElseThrow(() -> LayoutRejections.noVersion(headerId, ver));
        return assembler.assemble(new LayoutSnapshotAssembler.MessagePart(headerId, hl.getLayoutName(), hv.getVer(), null, null, null,
                hv.getOwnLength(), queries.itemsOf(headerId, hv.getVer())), List.of(), Map.of());
    }

    /** 시각 T 의 EAI 표준 헤더({@link LayoutVersions#eaiHeadersAt}) — 없으면 빈 값. T 는 null 불가. */
    public Optional<Long> eaiHeaderAt(String eaiCode, LocalDateTime asOf) {
        return eaiCode == null ? Optional.empty() : Optional.ofNullable(eaiHeadersAt(asOf).get(eaiCode));
    }

    /** 시각 T 의 EAI 코드 → 표준 헤더 ID(헤더 RELEASED 버전을 한 번 읽는다). T 는 null 불가. */
    public Map<String, Long> eaiHeadersAt(LocalDateTime asOf) {
        return LayoutVersions.eaiHeadersAt(store.releasedHeaderVersions(), asOf);
    }

    public Optional<MdmLayoutVer> headerAt(long headerId, LocalDateTime asOf) {
        return LayoutVersions.releasedAt(store.versions(headerId), asOf);
    }
}
