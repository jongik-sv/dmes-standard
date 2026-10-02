package com.dongkuk.dmes.mdm.dmb.layout.confirm;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutBodySnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutChangeClassifier;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutColumnInfo;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutConstJudge;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDictionary;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutIssue;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemDraft;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutItemRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutLengthRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutQueries;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRegistrationRules;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRejections;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutRows;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutTimes;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersions;
import com.dongkuk.dmes.mdm.entity.MdmEai;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmEaiRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * 레이아웃 확정 검사(D-144 3단계, 스펙 §7). 판정 시각은 apply_from — 그 시각의 헤더 버전으로 합성해 본다.
 * <ul>
 *   <li>전문: ① 저장된 구성 그대로 등록 검사({@link LayoutDraftBuilder#buildStored} — L01~L15, 헤더 해석 L09, 재정의 L10) ② 합성
 *       총 길이가 MSG_LENGTH 칸에 들어가는지(L16) ③ 동시 전환이면 경고({@link #SIMULTANEOUS_SWITCH}).</li>
 *   <li>헤더: ① 항목 검사(L01~L08, L12~L15) ② 사용 전문 영향도·EAI 표준 헤더 전환({@link LayoutHeaderImpact}) ③ 동시 전환 경고.</li>
 * </ul>
 * 변경 분류는 확정 시점으로 옮긴 {@link LayoutChangeClassifier} 를 그대로 쓴다. 합성·분류가 레이아웃 거부(L09·L11 등)로 실패하면 화면이
 * 통째로 실패하지 않게 그 사유를 오류 행으로 바꿔 싣는다 — 확정은 그 오류로 막힌다.
 */
@Component
public class LayoutConfirmChecks {

    /** 경고 코드 — 상대 시스템 파서가 깨지는 변경이라 송신·수신이 apply_from 에 함께 전환해야 한다. */
    public static final String SIMULTANEOUS_SWITCH = "SIMULTANEOUS_SWITCH";

    private static final String HEADER = "HEADER";

    private final LayoutComposer composer;
    private final LayoutDraftBuilder draftBuilder;
    private final LayoutVersionStore store;
    private final LayoutQueries queries;
    private final LayoutDictionary dictionary;
    private final LayoutConstJudge constJudge;
    private final LayoutCodecs codecs;
    private final LayoutSnapshotAssembler assembler;
    private final MdmLayoutRepository layoutRepository;
    private final MdmEaiRepository eaiRepository;
    private final LayoutHeaderImpact headerImpact;

    public LayoutConfirmChecks(LayoutComposer composer, LayoutDraftBuilder draftBuilder, LayoutVersionStore store, LayoutQueries queries,
                               LayoutDictionary dictionary, LayoutConstJudge constJudge, LayoutCodecs codecs,
                               LayoutSnapshotAssembler assembler, MdmLayoutRepository layoutRepository, MdmEaiRepository eaiRepository,
                               LayoutHeaderImpact headerImpact) {
        this.composer = composer;
        this.draftBuilder = draftBuilder;
        this.store = store;
        this.queries = queries;
        this.dictionary = dictionary;
        this.constJudge = constJudge;
        this.codecs = codecs;
        this.assembler = assembler;
        this.layoutRepository = layoutRepository;
        this.eaiRepository = eaiRepository;
        this.headerImpact = headerImpact;
    }

    /**
     * @param applyFrom 판정 시각 — null 불가(호출자가 빈 적용 시작 시각을 먼저 거부한다. 합성기는 null 을 지금으로 대신하지 않는다)
     */
    public LayoutConfirmReport report(VersionRef draft, LocalDateTime applyFrom) {
        Objects.requireNonNull(applyFrom, "applyFrom");
        long id = Long.parseLong(draft.objectId());
        MdmLayout layout = layout(id);
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        List<Map<String, Object>> impact = List.of();
        List<String> eais = List.of();
        if (HEADER.equals(layout.getLayoutKind())) {
            List<LayoutItemDraft> drafts = LayoutRows.drafts(LayoutRows.items(queries.itemsOf(id, draft.ver()), Map.of()));
            LayoutDictionary.Cache cache = dictionary.cache();
            Map<String, LayoutColumnInfo> dict = cache.byPhysNames(LayoutRows.physNames(drafts));
            List<LayoutIssue> issues = new ArrayList<>(LayoutItemRules.check(drafts, dict));
            issues.addAll(LayoutRegistrationRules.check(drafts, dict, codecs.units(),
                    LayoutDraftBuilder.charset(headerEncoding(id, draft.ver())), LayoutDraftBuilder.lengthsBySeq(drafts, dict),
                    constJudge.forColumns(LayoutRows.physNames(drafts), cache), new ArrayList<>()));
            issues.forEach(i -> errors.add(issue(i)));
            // 사용 전문 영향도(apply_from 시점 총 길이·MSG_LENGTH·재정의 짝)와 EAI 표준 헤더 전환(Ruling P3-15·P3-17, 시각 T 해석)
            LayoutHeaderImpact.Result r = headerImpact.evaluate(id, draft.ver(), applyFrom);
            errors.addAll(r.errors());
            warnings.addAll(r.warnings());
            impact = r.rows();
            eais = r.eaiCodes();
        } else {
            LayoutDraftBuilder.Built built = draftBuilder.buildStored(id, draft.ver(), applyFrom);
            built.issues().forEach(i -> errors.add(issue(i)));
            if (errors.isEmpty()) {
                try {
                    LayoutLengthRules.msgLengthIssues(composer.compose(id, draft.ver(), applyFrom)).forEach(i -> errors.add(issue(i)));
                } catch (BusinessException e) {
                    errors.addAll(issues(e));
                }
            }
        }
        LayoutChangeClassifier.Change change = null;
        if (errors.isEmpty()) {
            try {
                change = classify(id, draft.ver(), applyFrom);
            } catch (BusinessException e) {
                errors.addAll(issues(e)); // 직전 버전을 그 시각으로 합성할 수 없다 — 분류 없이 확정하지 않는다
            }
        }
        if (change != null && LayoutChangeClassifier.SIMULTANEOUS.equals(change.switchMode())) {
            warnings.add(new MdmCheckIssue(SIMULTANEOUS_SWITCH, "동시 전환 — 송신·수신 양쪽이 " + LayoutTimes.text(applyFrom)
                    + " 에 맞춰 함께 전환해야 합니다: " + change.summary(), "SWITCH_MODE", null));
        }
        return new LayoutConfirmReport(layout.getLayoutKind(), List.copyOf(errors), List.copyOf(warnings), change, impact, eais);
    }

    /**
     * 직전 RELEASED 대비 분류 — 전문은 두 버전을 같은 시각(apply_from)의 헤더로 합성해 비교하고(헤더 변경은 헤더 확정이 분류한다), 헤더는
     * 헤더 한 벌만 비교한다. 직전 RELEASED 가 없으면 INITIAL(전환 방식 null).
     *
     * <p>헤더 버전 행의 EAI_CODE(표준 헤더 주장 — Ruling P3-15 의 시각 T 해석 근거)가 바뀌면 META(순차)로 잡는다(Ruling P3-18). 헤더의
     * 인코딩·패딩은 전문 EAI 가 정하므로 FORMAT 으로 보지 않는다 — 합성 스냅샷에는 EAI 코드만 싣는다.
     *
     * @param applyFrom 판정 시각 — null 불가
     */
    public LayoutChangeClassifier.Change classify(long layoutId, BigDecimal ver, LocalDateTime applyFrom) {
        Objects.requireNonNull(applyFrom, "applyFrom");
        boolean header = HEADER.equals(layout(layoutId).getLayoutKind());
        Optional<MdmLayoutVer> prev = LayoutVersions.previousReleased(store.versions(layoutId), ver);
        MdmLayoutSnapshot next = header ? headerAlone(layoutId, ver) : composer.compose(layoutId, ver, applyFrom);
        MdmLayoutSnapshot before = prev.map(p -> header ? headerAlone(layoutId, p.getVer())
                : composer.compose(layoutId, p.getVer(), applyFrom)).orElse(null);
        Map<String, LayoutColumnInfo> dict = dictionary.byPhysNames(physNames(before, next));
        LayoutChangeClassifier.Change change = LayoutChangeClassifier.classify(before, next,
                phys -> dict.containsKey(phys) ? dict.get(phys).displayName() : null);
        if (header && before != null && !Objects.equals(before.eaiCode(), next.eaiCode())) {
            String eaiChange = "EAI 표준 헤더 주장 " + eaiText(before.eaiCode()) + " → " + eaiText(next.eaiCode());
            change = new LayoutChangeClassifier.Change(change.switchMode(), change.kinds(), eaiChange + ", " + change.summary());
        }
        return change;
    }

    /** 헤더 한 벌({@link LayoutComposer#headerAlone}) + 그 버전 행의 EAI_CODE. 인코딩·패딩은 싣지 않는다(분류가 FORMAT 으로 오인하지 않게). */
    private MdmLayoutSnapshot headerAlone(long headerId, BigDecimal ver) {
        MdmLayoutSnapshot s = composer.headerAlone(headerId, ver);
        String eaiCode = store.find(headerId, ver).map(MdmLayoutVer::getEaiCode).orElse(null);
        return new MdmLayoutSnapshot(s.layoutId(), s.layoutName(), eaiCode, s.sndSystem(), s.rcvSystem(), s.encoding(), s.padRule(),
                s.layoutVersion(), s.totalLength(), s.headers(), s.items());
    }

    private static String eaiText(String eaiCode) {
        return eaiCode == null ? "없음" : eaiCode;
    }

    /** 확정 본문 스냅샷 — 헤더는 ID 만(K1). 항목 offset 은 저장값(본문 기준 상대 / 헤더 안 상대). */
    public String bodySnapshotJson(long layoutId, BigDecimal ver) {
        MdmLayout layout = layout(layoutId);
        MdmLayoutVer v = store.find(layoutId, ver).orElseThrow(() -> LayoutRejections.noVersion(layoutId, ver));
        MdmLayoutSnapshot own = assembler.assemble(new LayoutSnapshotAssembler.MessagePart(layoutId, layout.getLayoutName(), v.getVer(),
                v.getEaiCode(), layout.getSndSystem(), layout.getRcvSystem(), v.getOwnLength(), queries.itemsOf(layoutId, v.getVer())),
                List.of(), Map.of());
        return LayoutSnapshotJson.writeAny(LayoutBodySnapshot.of(layout, v, queries.headersOf(layoutId, v.getVer()),
                queries.constsOf(layoutId, v.getVer()), own.items()));
    }

    static MdmCheckIssue issue(LayoutIssue i) {
        return new MdmCheckIssue(i.code().name(), i.message(), i.field(), i.seq() == null ? null : String.valueOf(i.seq()));
    }

    /** 레이아웃 거부 예외의 이슈 행(첫 detail 은 묶음 코드) → 검사 행. 이슈 행이 없으면 첫 detail 코드와 예외 문구 한 행. */
    static List<MdmCheckIssue> issues(BusinessException e) {
        List<ErrorDetail> details = e.getErrors() == null ? List.of() : e.getErrors();
        List<MdmCheckIssue> out = new ArrayList<>();
        for (int i = 1; i < details.size(); i++) {
            ErrorDetail d = details.get(i);
            out.add(new MdmCheckIssue(d.code(), d.message(), d.field(), d.rowKey()));
        }
        if (out.isEmpty()) {
            out.add(new MdmCheckIssue(details.isEmpty() ? e.getErrorCode().name() : details.get(0).code(), e.getMessage(), null, null));
        }
        return out;
    }

    private MdmLayout layout(long id) {
        return layoutRepository.findById(id).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_VALUE, "레이아웃을 찾을 수 없습니다: " + id));
    }

    /** 헤더 바이트 길이를 셀 인코딩 — 이 버전 행의 EAI(헤더의 EAI 는 버전 행이 정본, Ruling P3-15) → 없음(UTF-8). */
    private String headerEncoding(long headerId, BigDecimal ver) {
        return store.find(headerId, ver).map(MdmLayoutVer::getEaiCode).flatMap(eaiRepository::findById).map(MdmEai::getEncoding)
                .orElse(null);
    }

    private static List<String> physNames(MdmLayoutSnapshot... snapshots) {
        List<String> out = new ArrayList<>();
        for (MdmLayoutSnapshot s : snapshots) {
            if (s == null) {
                continue;
            }
            for (MdmLayoutHeaderRef h : s.headers()) {
                h.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(out::add);
            }
            s.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(out::add);
        }
        return out;
    }
}
