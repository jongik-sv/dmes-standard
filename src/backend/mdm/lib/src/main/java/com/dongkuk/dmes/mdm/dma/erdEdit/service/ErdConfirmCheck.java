package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdColumn;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdTable;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdColumnStatus;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdStandardJudge;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * ERD_MODEL 확정 검사(스펙 D19) — 직전 RELEASED 와 견줘 추가·변경한 컬럼의 표준 위반(TYPE·DOMAIN·MISS)만 막는다. 옛 위반과 검토하지
 * 않은 추정(INFERRED) 관계는 경고다. 사전은 검사 한 번에 한 번만 읽는다(I26).
 */
@Component
public class ErdConfirmCheck implements VersionConfirmCheckSpi {

    private final ErdModelStore store;
    private final ErdDictionaryLoader dictionaries;

    public ErdConfirmCheck(ErdModelStore store, ErdDictionaryLoader dictionaries) {
        this.store = store;
        this.dictionaries = dictionaries;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    /** 컬럼 단위 diff. 키 = 컬럼 UUID, 값은 요소 속성에서 편집 이력({@code _rev})을 뺀 것이다. */
    @Override
    public VersionDiff diff(VersionRef draft) {
        ErdModel now = read(draft);
        var base = store.latestReleased(draft.objectId());
        ErdModel before = base.map(b -> ErdModelCodec.read(b.getModelJson()))
                .orElse(ErdModel.empty(now.model.module, now.model.schema));
        List<VersionDiffEntry> entries = new ArrayList<>();
        for (var e : now.columns.entrySet()) {
            ErdColumn old = before.columns.get(e.getKey());
            Map<String, Object> nv = values(e.getValue());
            if (old == null) {
                entries.add(new VersionDiffEntry(e.getKey(), DiffKind.ADDED, null, nv));
            } else {
                Map<String, Object> ov = values(old);
                if (!ov.equals(nv)) entries.add(new VersionDiffEntry(e.getKey(), DiffKind.CHANGED, ov, nv));
            }
        }
        for (String id : before.columns.keySet()) {
            if (!now.columns.containsKey(id)) entries.add(new VersionDiffEntry(id, DiffKind.REMOVED, null, null));
        }
        VersionRef baseRef = base.map(b -> new VersionRef(VersionTarget.ERD_MODEL, b.getErdModelId(), b.getVer())).orElse(null);
        return new VersionDiff(baseRef, draft, entries);
    }

    /**
     * 확정 경로(requestedApplyFrom 있음)에서는 먼저 모델 행을 잠근다 — 공통 confirm 트랜잭션 안에서 casConfirm(버전 행)보다 앞이라, 확정·DRAFT
     * 삭제·명령 적용이 모두 "모델 행 → 버전 행" 순서로 잠가 서로 엇갈려 막히지(ORA-00060) 않는다. 잠근 뒤 읽으므로 검사하는 JSON 도
     * 그 사이 명령에 밀리지 않는다. 미리 검사(validate, applyFrom 없음)는 잠그지 않는다 — 읽기만 하고 트랜잭션 없이도 불린다.
     */
    @Override
    public ConfirmCheckResult check(ConfirmCheckRequest request) {
        if (request.requestedApplyFrom() != null) store.lockRev(request.draft().objectId());
        VersionDiff diff = diff(request.draft());
        Set<String> changed = new HashSet<>();
        for (VersionDiffEntry e : diff.entries()) {
            if (e.kind() != DiffKind.REMOVED) changed.add(e.key());
        }
        ErdModel now = read(request.draft());
        // D19 + 판정 R8-1: RELEASED 가 없으면(가져온 모델의 첫 버전) 비교 기준이 없어 모든 컬럼이 "추가" 로 잡힌다. 옛 위반이 첫 확정을
        // 막지 않도록 이때는 표준 위반을 전부 경고로만 알린다. 막는 규칙은 두 번째 버전부터 적용한다.
        boolean firstVersion = diff.base() == null;
        Map<String, ErdColumnStatus> statuses = ErdStandardJudge.judge(now, dictionaries.load());
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        statuses.forEach((id, st) -> {
            if (!st.blocksConfirm()) return;
            ErdColumn c = now.columns.get(id);
            ErdTable t = now.tables.get(c.table);
            String where = (t == null ? c.table : t.phys) + "." + c.phys;
            MdmCheckIssue issue = new MdmCheckIssue("ERD_STD_" + st.name(), where + " 표준 위반(" + st.name() + ")", "column", id);
            (!firstVersion && changed.contains(id) ? errors : warnings).add(issue);
        });
        long inferred = now.relations.values().stream().filter(r -> "INFERRED".equals(r.state)).count();
        if (inferred > 0) {
            warnings.add(new MdmCheckIssue("ERD_INFERRED_LEFT", "검토하지 않은 추정 관계 " + inferred + "개", "relation", null));
        }
        return new ConfirmCheckResult(errors, warnings);
    }

    private ErdModel read(VersionRef ref) {
        return ErdModelCodec.read(store.find(ref).orElseThrow(() -> MdmErrors.of(MdmErrorCode.ERD_MODEL_NOT_FOUND)).getModelJson());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> values(ErdColumn c) {
        Map<String, Object> m = ErdModelCodec.MAPPER.convertValue(c, Map.class);
        m.remove("_rev");
        return m;
    }
}
