package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.BiFunction;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 전문 저장 요청 → 검사 → 초안(TSK-05-03 design.md §2 — 불변 I19). 05-02 {@code LayoutMngService.save} 의 ①~⑥(대상·동시 수정,
 * 기본 속성 L11, 헤더 구성·EAI 표준 헤더 끼움 L09, 재정의 L10, 본문 L01~L08, 길이·배치)을 그대로 옮기고 03 등록 거부 #2·#3·#4·#7
 * (L12~L15, 재정의 값 포함)을 더한 한 곳이다. 이슈는 모두 모은다. save 는 이슈가 있으면 쓰기 전에 거부하고, validate 는 7행 표로,
 * execute 는 렌더 여부로 쓴다. 쓰기는 하지 않는다.
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

    public LayoutDraftBuilder(LayoutQueries queries, LayoutDictionary dictionary, MdmLayoutRepository layoutRepository,
                              MdmEaiRepository eaiRepository, LayoutConstJudge constJudge, LayoutCodecs codecs) {
        this.queries = queries;
        this.dictionary = dictionary;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
        this.constJudge = constJudge;
        this.codecs = codecs;
    }

    /**
     * @param draft    이슈가 없을 때만 있다
     * @param target   저장된 대상 전문(새 전문이면 null)
     */
    public record Built(LayoutDraft draft, List<LayoutIssue> issues, List<LayoutIssue> warnings, MdmLayout target, MdmEai eai,
                        List<MdmLayout> headerLayouts, Map<String, LayoutColumnInfo> dictionary) {
    }

    /** @param forSave 참이면 요청 ver 를 DB 감사 VER 와 대조한다(다르면 MDM001) */
    public Built build(LayoutMngSaveRequest request, List<Map<String, Object>> headers, List<Map<String, Object>> consts,
                       List<Map<String, Object>> items, boolean forSave) {
        // ① 대상·동시 수정
        MdmLayout layout = null;
        if (request.getLayoutId() != null) {
            layout = message(request.getLayoutId());
            if (forSave && !Objects.equals(request.getVer(), layout.getVersion())) {
                throw MdmErrors.of(MdmErrorCode.ROW_VERSION_CONFLICT);
            }
        }
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
        // ② 헤더 구성 — EAI 표준 헤더가 없으면 맨 앞에 끼운다(05-02 I14)
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
        // ③ 재정의 — 이 전문에 쌓인 헤더의 CONST 항목만. 빈 값은 "재정의 없음"(05-02 I10). 같은 대상은 마지막 값
        Map<String, LayoutDraft.ConstRow> constRows = new LinkedHashMap<>();
        List<LayoutRegistrationRules.Override> overrides = new ArrayList<>();
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
            constRows.put(headerId + ":" + seqValue, new LayoutDraft.ConstRow(headerId, seqValue.intValue(), value));
            overrides.add(new LayoutRegistrationRules.Override(headerId, seqValue.intValue(), target.getColumnPhys(), value,
                    target.getLength()));
        }
        // ④ 본문 항목
        List<LayoutItemDraft> drafts = LayoutRows.drafts(items);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(LayoutRows.physNames(drafts));
        issues.addAll(LayoutItemRules.check(drafts, dict));
        // ④' 03 등록 거부 #2·#3·#4·#7(L12~L15) — 바이트 길이는 전문 EAI 인코딩으로 센다(없으면 UTF-8)
        Charset charset = charset(eai == null ? null : eai.getEncoding());
        List<String> judged = new ArrayList<>(LayoutRows.physNames(drafts));
        overrides.forEach(o -> judged.add(o.columnPhys()));
        BiFunction<String, String, LayoutConstJudge.Judgement> judge = constJudge.forColumns(judged);
        issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(), charset, lengthsBySeq(drafts, dict), judge, warnings));
        Map<String, LayoutColumnInfo> overrideDict = dictionary.byPhysNames(overrides.stream()
                .map(LayoutRegistrationRules.Override::columnPhys).toList());
        issues.addAll(LayoutRegistrationRules.checkOverrides(overrides, overrideDict, charset, judge, warnings));
        if (!issues.isEmpty()) {
            return new Built(null, issues, warnings, layout, eai, headerLayouts, dict);
        }
        // ⑤ 계산 — 헤더 길이는 저장된 헤더 TOTAL_LENGTH 그대로(헤더는 쓰지 않는다, 05-02 I8)
        List<Integer> lengths = LayoutRows.lengths(drafts, dict);
        LayoutOffsetCalculator.Stacked s = LayoutOffsetCalculator.placeMessage(
                headerLayouts.stream().map(MdmLayout::getTotalLength).toList(), lengths);
        LayoutDraft draft = new LayoutDraft(layout == null ? null : layout.getLayoutId(), name, eaiCode, snd, rcv, List.copyOf(headerIds),
                List.copyOf(constRows.values()), drafts, lengths, s);
        return new Built(draft, issues, warnings, layout, eai, headerLayouts, dict);
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

    private Map<Integer, MdmLayoutItem> itemsBySeq(Long headerId) {
        Map<Integer, MdmLayoutItem> out = new HashMap<>();
        for (MdmLayoutItem i : queries.itemsOf(headerId)) {
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
