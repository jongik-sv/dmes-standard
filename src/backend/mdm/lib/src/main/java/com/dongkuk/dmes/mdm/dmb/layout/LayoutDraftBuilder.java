package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.dictionary.EffectiveDomainView;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 전문 저장 요청 → 검사 → 초안(TSK-05-03 design.md §2 — 불변 I19). 05-02 {@code LayoutMngService.save} 의 ②~⑥(기본 속성 L11,
 * 헤더 구성·EAI 표준 헤더 끼움 L09, 재정의 L10, 본문 L01~L08, 길이·배치)을 그대로 옮기고 03 등록 거부 #2·#3·#4·#7(L12~L15, 재정의
 * 값 포함)을 더한 한 곳이다. 이슈는 모두 모은다. save 는 이슈가 있으면 쓰기 전에 거부하고, validate 는 7행 표로, execute 는 렌더
 * 여부로 쓴다. 쓰기는 하지 않는다.
 *
 * <p>D-144 3단계: 쌓은 헤더는 판정 시각 {@code asOf} 에 유효한 RELEASED 버전({@link LayoutComposer#headerAt})으로 읽는다 — 없으면
 * L09. 동시 수정은 여기서 보지 않는다(저장이 공통 {@code VersionWriteGuard.beginDraftWrite} 로 본다). 본문 오프셋은 본문 시작 기준
 * 상대값이다.
 */
@Component
public class LayoutDraftBuilder {

    private static final String HEADER = "HEADER";
    private static final String MESSAGE = "MESSAGE";

    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;
    private final LayoutConstJudge constJudge;
    private final LayoutCodecs codecs;
    private final LayoutComposer composer;
    private final LayoutVersionStore versionStore;

    public LayoutDraftBuilder(LayoutQueries queries, LayoutDictionary dictionary, MdmLayoutRepository layoutRepository,
                              MdmEaiRepository eaiRepository, LayoutConstJudge constJudge, LayoutCodecs codecs,
                              LayoutComposer composer, LayoutVersionStore versionStore) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
        this.constJudge = constJudge;
        this.codecs = codecs;
        this.composer = composer;
        this.versionStore = versionStore;
    }

    /**
     * @param draft    이슈가 없을 때만 있다
     * @param target   저장된 대상 전문(새 전문이면 null)
     */
    public record Built(LayoutDraft draft, List<LayoutIssue> issues, List<LayoutIssue> warnings, MdmLayout target, MdmEai eai,
                        Map<String, LayoutColumnInfo> dictionary) {
    }

    /**
     * @param asOf            쌓은 헤더 버전을 고를 판정 시각
     * @param insertEaiHeader 참이면 EAI 표준 헤더가 구성에 없을 때 맨 앞에 끼운다(I14 — 그 헤더에 {@code asOf} 시점 RELEASED 가 있을
     *                        때만). 화면 경로(save·validate·execute)는 참, 확정 검사는 저장된 구성 그대로 보므로 거짓
     */
    public Built build(LayoutMngSaveRequest request, List<Map<String, Object>> headers, List<Map<String, Object>> consts,
                       List<Map<String, Object>> items, LocalDateTime asOf, boolean insertEaiHeader) {
        // ① 대상 — 부모만 읽는다. 동시 수정(row_version)은 저장이 beginDraftWrite 로 본다
        MdmLayout layout = request.getLayoutId() == null ? null : message(request.getLayoutId());
        List<LayoutIssue> issues = new ArrayList<>();
        List<LayoutIssue> warnings = new ArrayList<>();
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
        List<Long> headerIds = new ArrayList<>();
        for (Map<String, Object> row : headers == null ? List.<Map<String, Object>>of() : headers) {
            headerIds.add(LayoutRows.id(row.get("HEADER_LAYOUT_ID")));
        }
        // ②' EAI 표준 헤더가 없으면 맨 앞에 끼운다(05-02 I14). 표준 헤더는 판정 시각에 RELEASED 인 헤더 버전 가운데 EAI_CODE 가 이 EAI
        //    인 헤더다(Ruling P3-15 — TB_MDM_EAI.HEADER_LAYOUT_ID 는 읽지 않는다). 남의 헤더 DRAFT·예약 확정은 그 시각 전에는 끼워지지
        //    않는다 — 전문 저장을 L09 로 막지 않게(Review Focus 6), 미래 확정 전에는 옛 표준 헤더가 그대로 끼워지게
        if (insertEaiHeader && eai != null) {
            composer.eaiHeaderAt(eai.getEaiCode(), asOf).filter(std -> !headerIds.contains(std)).ifPresent(std -> headerIds.add(0, std));
        }
        // ② 헤더 구성 — 헤더마다 판정 시각의 RELEASED 버전(없으면 L09, 헤더 길이 0 으로 합성하지 않는다 — 스펙 §8)
        List<LayoutSnapshotAssembler.HeaderPart> parts = new ArrayList<>();
        Map<Long, LayoutSnapshotAssembler.HeaderPart> partById = new HashMap<>();
        Set<Long> seen = new HashSet<>();
        for (int i = 0; i < headerIds.size(); i++) {
            Long id = headerIds.get(i);
            MdmLayout h = id == null ? null : layoutRepository.findById(id).orElse(null);
            if (h == null || !HEADER.equals(h.getLayoutKind())) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L09, i + 1, "HEADER_LAYOUT_ID", "헤더 레이아웃이 아니다: " + id));
                continue;
            }
            if (!seen.add(id)) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L09, i + 1, "HEADER_LAYOUT_ID", "같은 헤더를 두 번 쌓을 수 없다: " + id));
                continue;
            }
            Optional<MdmLayoutVer> hv = composer.headerAt(id, asOf);
            if (hv.isEmpty()) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L09, i + 1, "HEADER_LAYOUT_ID",
                        "헤더 " + id + " 에 시각 " + LayoutTimes.text(asOf) + " 에 확정된 버전이 없다"));
                continue;
            }
            LayoutSnapshotAssembler.HeaderPart part = new LayoutSnapshotAssembler.HeaderPart(id, h.getLayoutName(), hv.get().getVer(),
                    hv.get().getOwnLength(), queries.itemsOf(id, hv.get().getVer()));
            parts.add(part);
            partById.put(id, part);
        }
        // ③ 재정의 — 이 전문에 쌓인 헤더(판정 시각 버전)의 CONST 항목만. 빈 값은 "재정의 없음"(05-02 I10). 같은 대상은 마지막 값.
        //    화면은 HEADER_SEQ 로 주고, 저장 대상은 그 헤더 버전의 항목 물리명이다
        Map<String, LayoutDraft.ConstRow> constRows = new LinkedHashMap<>();
        List<LayoutRegistrationRules.Override> overrides = new ArrayList<>();
        List<MdmLayoutItem> overrideTargets = new ArrayList<>(); // overrides 와 같은 순서 — 재정의 대상 헤더 항목 행
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
            LayoutSnapshotAssembler.HeaderPart part = partById.get(headerId);
            if (part == null) {
                continue; // 판정 시각에 확정 버전이 없는 헤더 — L09 로 이미 거부한다
            }
            MdmLayoutItem target = itemsBySeq(part).get(seqValue.intValue());
            if (target == null || !MdmFillKind.CONST.name().equals(target.getFillKind())) {
                issues.add(LayoutIssue.of(LayoutIssueCode.L10, seqValue.intValue(), "HEADER_SEQ",
                        "CONST 항목만 재정의할 수 있다: 헤더 " + headerId + " 항목 " + seqValue
                                + (target == null ? "(없음)" : "(" + target.getFillKind() + ")")));
                continue;
            }
            constRows.put(headerId + ":" + seqValue,
                    new LayoutDraft.ConstRow(headerId, seqValue.intValue(), target.getColumnPhys(), value));
            overrides.add(new LayoutRegistrationRules.Override(headerId, seqValue.intValue(), target.getColumnPhys(), value,
                    target.getLength()));
            overrideTargets.add(target);
        }
        // ④ 본문 항목
        List<LayoutItemDraft> drafts = LayoutRows.drafts(items);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(LayoutRows.physNames(drafts));
        issues.addAll(LayoutItemRules.check(drafts, dict));
        // ④' 03 등록 거부 #2·#3·#4·#7(L12~L15) — 바이트 길이는 전문 EAI 인코딩으로 센다(없으면 UTF-8)
        Charset charset = charset(eai == null ? null : eai.getEncoding());
        BiFunction<String, String, LayoutConstJudge.Judgement> judge = constJudge.forColumns(LayoutRows.physNames(drafts));
        issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(), charset, lengthsBySeq(drafts, dict), judge, warnings));
        // 재정의 값은 그 헤더 버전 항목이 직렬화에 쓰는 타입·소수·단위로 판정한다(D-151 — 확정 헤더 버전이면 고정값, 합성과 같은 선택
        // LayoutSnapshotAssembler.columnAttrs). 같은 물리명이 쌓은 헤더 둘에 있어도 항목마다 따로 본다. 표준식은 지금 사전의 것이다
        LayoutDictionary.Cache overrideCache = dictionary.cache();
        List<String> overridePhys = overrides.stream().map(LayoutRegistrationRules.Override::columnPhys).toList();
        Map<String, LayoutColumnInfo> overrideDict = overrideCache.byPhysNames(overridePhys);
        Map<String, EffectiveDomainView> overrideViews = overrideCache.views(overridePhys);
        for (int i = 0; i < overrides.size(); i++) {
            MdmLayoutItem target = overrideTargets.get(i);
            LayoutSnapshotAssembler.ColumnAttrs attrs = LayoutSnapshotAssembler.columnAttrs(target.isPinned(), target.getDataType(),
                    target.getUnitCode(), target.getScale(), overrideDict.get(target.getColumnPhys()));
            issues.addAll(LayoutRegistrationRules.checkOverrides(List.of(overrides.get(i)), overrideDict, charset,
                    constJudge.withAttrs(overrideViews, attrs), warnings));
        }
        if (!issues.isEmpty()) {
            return new Built(null, issues, warnings, layout, eai, dict);
        }
        // ⑤ 계산 — 본문 오프셋은 본문 시작 기준 상대값, 본문 길이 = ownLength. 총 길이 = 헤더 버전 길이 합 + ownLength
        List<Integer> lengths = LayoutRows.lengths(drafts, dict);
        LayoutOffsetCalculator.Placed body = LayoutOffsetCalculator.placeHeader(lengths);
        LayoutDraft draft = new LayoutDraft(layout == null ? null : layout.getLayoutId(), name, eaiCode, snd, rcv, List.copyOf(headerIds),
                List.copyOf(constRows.values()), drafts, lengths, body.offsets(), body.total(), List.copyOf(parts));
        return new Built(draft, issues, warnings, layout, eai, dict);
    }

    /**
     * 저장된 버전 행을 화면 요청 모양으로 바꿔 같은 검사를 탄다(확정 검사 — 판정 시각 = apply_from). EAI 표준 헤더를 끼우지 않고 저장된
     * 구성 그대로 본다. 재정의는 저장된 헤더 항목 물리명을 {@code asOf} 시점 헤더 버전의 SEQ 로 바꿔 넣는다 — 그 버전에 같은 물리명이 없으면
     * L10(헤더 항목 순서가 바뀌어도 물리명으로 따라가고, 대상이 없어지면 조용히 기본값으로 나가지 않는다).
     *
     * @param asOf 판정 시각 — null 불가(호출자가 빈 값을 먼저 거부한다)
     */
    public Built buildStored(long messageId, BigDecimal ver, LocalDateTime asOf) {
        MdmLayout layout = message(messageId);
        MdmLayoutVer v = versionStore.find(messageId, ver).orElseThrow(() -> LayoutRejections.noVersion(messageId, ver));
        LayoutMngSaveRequest request = new LayoutMngSaveRequest();
        request.setLayoutId(messageId);
        request.setVer(VersionNumbers.plain(v.getVer()));
        request.setLayoutName(layout.getLayoutName());
        request.setEaiCode(v.getEaiCode());
        request.setSndSystem(layout.getSndSystem());
        request.setRcvSystem(layout.getRcvSystem());
        List<Map<String, Object>> headers = new ArrayList<>();
        for (MdmLayoutHeader h : queries.headersOf(messageId, v.getVer())) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("HEADER_LAYOUT_ID", h.getHeaderLayoutId());
            headers.add(row);
        }
        List<Map<String, Object>> consts = new ArrayList<>();
        List<LayoutIssue> unresolved = new ArrayList<>();
        for (MdmLayoutConst c : queries.constsOf(messageId, v.getVer())) {
            Optional<MdmLayoutItem> target = composer.headerAt(c.getHeaderLayoutId(), asOf)
                    .flatMap(hv -> queries.itemsOf(c.getHeaderLayoutId(), hv.getVer()).stream()
                            .filter(i -> c.getHeaderColumnPhys().equals(i.getColumnPhys())).findFirst());
            if (target.isEmpty()) {
                unresolved.add(LayoutIssue.of(LayoutIssueCode.L10, null, "HEADER_COLUMN_PHYS", "재정의 대상 " + c.getHeaderColumnPhys()
                        + " 이 시각 " + LayoutTimes.text(asOf) + " 의 헤더 " + c.getHeaderLayoutId() + " 버전에 없다"));
                continue;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("HEADER_LAYOUT_ID", c.getHeaderLayoutId());
            row.put("HEADER_SEQ", target.get().getSeq());
            row.put("CONST_VALUE", c.getConstValue());
            consts.add(row);
        }
        // 저장된 구성 그대로 — EAI 표준 헤더를 끼우지 않는다
        Built built = build(request, headers, consts, LayoutRows.items(queries.itemsOf(messageId, v.getVer()), Map.of()), asOf, false);
        if (unresolved.isEmpty()) {
            return built;
        }
        List<LayoutIssue> issues = new ArrayList<>(built.issues());
        issues.addAll(unresolved);
        return new Built(null, issues, built.warnings(), built.target(), built.eai(), built.dictionary());
    }

    /** 행마다 따로 — 길이를 정할 수 없는 행(L03·L07·L08)은 빠진다. */
    public static Map<Integer, Integer> lengthsBySeq(List<LayoutItemDraft> drafts, Map<String, LayoutColumnInfo> dict) {
        Map<Integer, Integer> out = new HashMap<>();
        for (LayoutItemDraft d : drafts) {
            try {
                out.put(d.seq(), LayoutRows.lengths(List.of(d), dict).get(0));
            } catch (IllegalArgumentException e) {
                // 길이 없음 — 05-02 규칙이 이미 잡는다
            }
        }
        return out;
    }

    /** EAI 인코딩(모르는 이름·없음이면 UTF-8). */
    public static Charset charset(String encoding) {
        if (encoding == null || encoding.isBlank()) {
            return StandardCharsets.UTF_8;
        }
        try {
            return Charset.forName(encoding.trim());
        } catch (IllegalArgumentException e) {
            return StandardCharsets.UTF_8;
        }
    }

    private static Map<Integer, MdmLayoutItem> itemsBySeq(LayoutSnapshotAssembler.HeaderPart part) {
        Map<Integer, MdmLayoutItem> out = new HashMap<>();
        for (MdmLayoutItem i : part.items()) {
            out.put(i.getSeq(), i);
        }
        return out;
    }

    public MdmLayout message(Long layoutId) {
        MdmLayout layout = layoutId == null ? null : layoutRepository.findById(layoutId).orElse(null);
        if (layout == null || !MESSAGE.equals(layout.getLayoutKind())) {
            throw LayoutRejections.notFound(layoutId, MESSAGE);
        }
        return layout;
    }
}
