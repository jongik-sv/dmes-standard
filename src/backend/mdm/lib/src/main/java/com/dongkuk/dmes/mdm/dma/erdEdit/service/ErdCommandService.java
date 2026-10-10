package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ResponseCodeAware;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdChangesView;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdDiagramCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ApplyOutcome;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdChange;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommand;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdCommandEngine;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdNaming;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdRejection;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModel;
import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.dongkuk.dmes.mdm.dma.erdEdit.standard.ErdDictionaryLoader;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.entity.MdmErdModelVer;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 명령 입구(스펙 2.1-2). 화면·MCP·CLI 모두 여기로 들어온다.
 *
 * <p>모델 행을 잠근 채(FOR UPDATE) 한 묶음씩 처리하므로 같은 모델의 묶음은 순서대로 rev 가 하나씩 오른다. 거절은 아무것도 쓰지 않는다
 * (트랜잭션을 버린다). 델타 발행은 커밋 뒤에만 한다. 클라이언트가 보낸 명령은 {@link ErdStrictReader} 로 엄격하게 읽고,
 * {@code restore}·{@code restoreDiagram} 은 직접 보낼 수 없다 — 되돌리기는 {@link #undo} 가 저장된 역명령으로 한다.
 */
@Service
public class ErdCommandService {

    static final int MAX_BATCH = 200;
    /** SYSTEM 은 표시 행(ErdReloadMarker) 전용이라 명령 출처로 받지 않는다 — SOURCE=SYSTEM 이면 언제나 표시 행이다. */
    private static final Set<String> SOURCES = Set.of("UI", "MCP", "CLI");

    private final ErdModelStore store;
    private final ErdDiagramStore diagrams;
    private final ErdCommandLogStore log;
    private final ErdDictionaryLoader dictionaries;
    private final VersionWriteGuard writeGuard;
    private final ErdEventHub hub;
    private final TransactionTemplate tx;
    private final TransactionTemplate readTx;
    private final ErdCoEditors coEditors;

    public ErdCommandService(ErdModelStore store, ErdDiagramStore diagrams, ErdCommandLogStore log,
                             ErdDictionaryLoader dictionaries, VersionWriteGuard writeGuard, ErdEventHub hub,
                             ErdCoEditors coEditors, PlatformTransactionManager transactionManager) {
        this.store = store;
        this.diagrams = diagrams;
        this.log = log;
        this.dictionaries = dictionaries;
        this.writeGuard = writeGuard;
        this.hub = hub;
        this.coEditors = coEditors;
        this.tx = new TransactionTemplate(transactionManager);
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    /** 클라이언트 명령 묶음 적용. {@code restore}·{@code restoreDiagram} 은 거절한다(R4-3). */
    public ErdApplyResult apply(String modelId, long baseRev, String userId, String session, String source, List<JsonNode> raw) {
        if (baseRev < 0) return rejectedNow(modelId, invalid(0, "baseRev 는 0 이상이어야 합니다", "getChangesSince 가 준 rev 를 쓰세요"));
        return applyInternal(modelId, baseRev, userId, session, source, raw, false, null, -1, false);
    }

    /**
     * @param baseRev 음수면 잠근 뒤의 현재 rev 를 쓴다(되돌리기 — 잠그기 전에 rev 를 읽으면 사이에 낡을 수 있다)
     * @param expectedAfter 되돌리기일 때만: 되돌릴 rev 의 변경 후 다이어그램 행(충돌 판정용). 클라이언트 명령이면 null.
     * @param undoOf 되돌리기일 때만: 되돌릴 rev. 그 뒤에 표시 행(DRAFT 삭제·새 DRAFT)이 있으면 INVALID. 클라이언트 명령이면 -1.
     * @param requireEmptyModel 첫 가져오기일 때만 true: 잠근 뒤 모델에 표가 있으면 INVALID.
     */
    private ErdApplyResult applyInternal(String modelId, long baseRev, String userId, String session, String source,
                                         List<JsonNode> raw, boolean allowRestore,
                                         Map<String, JsonNode> expectedAfter, long undoOf, boolean requireEmptyModel) {
        if (userId == null || userId.isBlank() || userId.length() > 50) {
            return rejectedNow(modelId, invalid(0, "userId 는 1~50자여야 합니다", "로그인한 사용자 id 를 넣으세요"));
        }
        if (session == null || session.isBlank() || session.length() > 100) {
            return rejectedNow(modelId, invalid(0, "session 은 1~100자여야 합니다", "세션 이름을 넣으세요"));
        }
        if (source == null || !SOURCES.contains(source)) {
            return rejectedNow(modelId, invalid(0, "source 는 UI·MCP·CLI 중 하나입니다", "호출 경로에 맞는 값을 넣으세요"));
        }
        if (raw == null || raw.isEmpty() || raw.size() > MAX_BATCH) {
            return rejectedNow(modelId, invalid(0, "명령은 1~" + MAX_BATCH + "건이어야 합니다", "나눠서 보내세요"));
        }
        // 클라이언트 묶음에서의 자리를 따로 적어 둔다 — 모델·다이어그램 명령이 섞여도 거절 위치는 클라이언트가 보낸 자리다.
        List<ErdCommand> modelCmds = new ArrayList<>();
        List<Integer> modelIdx = new ArrayList<>();
        List<ErdDiagramCommand> diagramCmds = new ArrayList<>();
        List<Integer> diagramIdx = new ArrayList<>();
        for (int i = 0; i < raw.size(); i++) {
            JsonNode n = raw.get(i);
            if (n == null || !n.isObject()) {
                return rejectedNow(modelId, invalid(i, "명령은 JSON 객체여야 합니다", "{\"op\":\"...\", ...} 모양으로 보내세요"));
            }
            String op = n.path("op").asText("");
            if (!allowRestore && (op.equals("restore") || op.equals("restoreDiagram"))) {
                return rejectedNow(modelId, invalid(i, "restore 는 직접 보낼 수 없습니다", "되돌리기는 undo(restore 액션)를 쓰세요"));
            }
            try {
                if (ErdDiagramCommand.isDiagramOp(op)) {
                    diagramCmds.add(ErdStrictReader.read(n, ErdDiagramCommand.class));
                    diagramIdx.add(i);
                } else {
                    modelCmds.add(ErdStrictReader.read(ErdStrictReader.withOptionalBooleans(n, op), ErdCommand.class));
                    modelIdx.add(i);
                }
            } catch (JsonProcessingException e) {
                return rejectedNow(modelId, invalid(i, "명령 JSON 을 읽을 수 없습니다: " + ErdStrictReader.brief(e),
                        "op 와 필드 이름·값 형식(숫자·불리언은 따옴표 없이)을 확인하세요"));
            } catch (IllegalArgumentException e) {
                return rejectedNow(modelId, invalid(i, "명령 JSON 을 읽을 수 없습니다: " + e.getMessage(),
                        "op 와 필드 이름·값 형식을 확인하세요"));
            }
        }
        // 사전은 요청마다 한 번, 모델 명령이 있을 때만 읽는다(I26). 모델 행을 잠그기 전에 읽어 잠금 시간을 줄인다.
        ErdNaming dict = modelCmds.isEmpty() ? null : dictionaries.load();
        return tx.execute(status -> {
            long rev = store.lockRev(modelId);
            if (baseRev > rev) {
                // 앞선 rev 를 주장하면 §4.3 의 속성별 충돌 판정(요소 rev > baseRev)이 꺼진다.
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, invalid(0, "baseRev 가 현재 rev(" + rev + ")보다 큽니다", "getChangesSince 로 받은 rev 를 쓰세요"));
            }
            long newRev = rev + 1;
            long engineBase = baseRev < 0 ? rev : baseRev;
            MdmErdModelVer draft = store.draft(modelId).orElse(null);
            if (!modelCmds.isEmpty() && draft == null) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, notEditor("DRAFT 가 없습니다", "copy 로 새 버전을 먼저 만드세요", null));
            }
            // 권한은 충돌·검증(엔진)보다 먼저 본다(스펙 2.1 순서: 잠금 → 권한 → 충돌 → 검증). 판정은 쓰기 가드(beginDraftWrite)와
            // 같은 규칙이고, 가드는 아래에서 row_version CAS 를 위해 그대로 부른다.
            if (!modelCmds.isEmpty() && !isEditor(draft, userId)) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, notEditor("이 DRAFT 를 고칠 권한이 없습니다",
                        "소유자(" + draft.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", draft.getOwnerId()));
            }
            // 다이어그램 명령만 있으면 DRAFT 가 없어도 된다 — 다이어그램은 버전 밖이다(스펙 D6). 표 존재는 지금 보이는 버전으로 확인한다.
            MdmErdModelVer shown = draft != null ? draft : store.current(modelId);
            var modelVer = shown.getVer();
            // 다이어그램은 DRAFT 가 없어도 고치지만 편집자(소유자·공동 편집자)만 고친다(R7-1 과 같은 규칙, 보이는 버전 기준).
            if (!diagramCmds.isEmpty() && !isEditor(shown, userId)) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, notEditor("이 모델의 다이어그램을 고칠 권한이 없습니다",
                        "소유자(" + shown.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", shown.getOwnerId()));
            }
            // 권한 다음, 엔진(충돌·검증) 전에: 기준 rev 뒤에 DRAFT 가 지워지거나 새로 만들어졌으면(표시 행) 모델 JSON 이 통째로 바뀐 것이다.
            // 요소 rev 로는 그 교체가 보이지 않으므로 여기서 막는다. 잠근 뒤에 봐야 사이에 낀 copy·삭제를 놓치지 않는다.
            //  - 되돌리기: 되돌릴 rev 뒤의 표시 — 그 명령은 지금 DRAFT 의 것이 아니다(같은 번호가 다시 쓰일 수 있어 번호 비교로는 못 가린다).
            //  - 클라이언트 명령: baseRev 뒤의 표시 — 낡은 모델을 보고 만든 명령이다.
            long since = undoOf >= 0 ? undoOf : baseRev;
            if (since >= 0 && since < rev && log.markerBetween(modelId, since, rev)) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, undoOf >= 0
                        ? invalid(0, "rev " + undoOf + " 뒤에 DRAFT 가 지워지거나 새로 만들어져 되돌릴 수 없습니다",
                                "지금 DRAFT 에서 한 변경만 되돌리세요. getChangesSince 가 reload 를 주면 모델을 다시 읽으세요")
                        : invalid(0, "baseRev(" + baseRev + ") 뒤에 DRAFT 가 지워지거나 새로 만들어졌습니다",
                                "getChangesSince 가 reload 를 주면 모델을 다시 읽고(view) 새 rev 를 baseRev 로 다시 보내세요"));
            }
            // 모델 JSON 은 엔진이나 placeTables(표 존재 확인)가 쓸 때만 읽는다 — 표를 끌어 옮기는 moveNodes 는 자주 오므로 파싱을 아낀다.
            boolean needModel = !modelCmds.isEmpty() || diagramCmds.stream().anyMatch(c -> c instanceof ErdDiagramCommand.PlaceTables);
            ErdModel model = needModel ? ErdModelCodec.read(shown.getModelJson()) : null;
            if (requireEmptyModel && !model.tables.isEmpty()) {
                status.setRollbackOnly();
                return ErdApplyResult.rejected(rev, invalid(0,
                        "이미 표가 있습니다(" + model.tables.size() + "개). 첫 가져오기는 표가 없는 모델에만 합니다",
                        "다시 가져오기 차이는 compare kind=DB_DIFF 로 보세요"));
            }
            List<ErdChange> changes = new ArrayList<>();
            List<ErdWarning> warnings = new ArrayList<>();
            ArrayNode inverse = ErdModelCodec.MAPPER.createArrayNode();
            if (!modelCmds.isEmpty()) {
                ApplyOutcome out = new ErdCommandEngine(dict).apply(model, engineBase, newRev, session, modelCmds);
                if (out instanceof ApplyOutcome.Rejected r) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, atClientIndex(r.rejection(), modelIdx));
                }
                var applied = (ApplyOutcome.Applied) out;
                VersionRef ref = new VersionRef(VersionTarget.ERD_MODEL, modelId, draft.getVer());
                try {
                    writeGuard.beginDraftWrite(ref, draft.getRowVersion(), userId);
                } catch (BusinessException e) {
                    // 소유자도 공동 편집자도 아니면 MDM003, DRAFT 가 아니면 MDM002. 그 밖의 오류(MDM001 낡은 row_version 등)는 그대로 던진다.
                    // 위의 권한 검사를 지났으므로 여기서 MDM003 은 드물다(사이에 소유자가 바뀐 경우 등) — 그래도 같은 모양으로 돌려준다.
                    if (isGuardCode(e, MdmErrorCode.NOT_DRAFT)) {
                        status.setRollbackOnly();
                        return ErdApplyResult.rejected(rev, notEditor("DRAFT 가 아닙니다(" + e.getMessage() + ")", "copy 로 새 버전을 먼저 만드세요",
                                draft.getOwnerId()));
                    }
                    if (!isGuardCode(e, MdmErrorCode.NOT_DRAFT_OWNER)) throw e;
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, notEditor("이 DRAFT 를 고칠 권한이 없습니다(" + e.getMessage() + ")",
                            "소유자(" + draft.getOwnerId() + ")에게 공동 편집자 등록(execute kind=ADD_EDITOR)을 요청하세요", draft.getOwnerId()));
                }
                // writeJson 은 em.clear() 한다 — 이 뒤에는 draft·shown 엔티티를 다시 읽지 않고 미리 꺼낸 값(modelVer)만 쓴다.
                store.writeJson(ref, ErdModelCodec.write(applied.next()));
                model = applied.next();
                changes.addAll(applied.changes());
                warnings.addAll(applied.warnings());
                for (ErdCommand inv : applied.inverse()) inverse.add(typed(ErdCommand.class, inv));
            }
            if (!diagramCmds.isEmpty()) {
                try {
                    var res = diagrams.apply(modelId, model, diagramCmds, diagramIdx, userId, expectedAfter);
                    changes.addAll(res.changes());
                    inverse.add(typed(ErdDiagramCommand.class, res.inverse()));
                } catch (ErdDiagramStore.ErdDiagramReject r) {
                    status.setRollbackOnly();
                    return ErdApplyResult.rejected(rev, r.rejection);
                }
            }
            store.setRev(modelId, newRev);
            log.insert(modelId, newRev, modelVer, userId, session, source,
                    ErdCommandLogStore.write(raw), ErdCommandLogStore.write(inverse), changes);
            ErdDelta delta = new ErdDelta(modelId, newRev, userId, session, source, List.copyOf(changes));
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    hub.publish(delta);
                }
            });
            Set<String> touchedTables = changes.stream().filter(c -> c.kind().equals("table") || c.kind().equals("column"))
                    .map(c -> c.kind().equals("table") ? c.id() : (c.value() == null ? null : c.value().path("table").asText(null)))
                    .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet());
            if (!touchedTables.isEmpty()) {
                hub.claims(modelId).stream()
                        .filter(cl -> touchedTables.contains(cl.tableId()) && !cl.session().equals(session))
                        .forEach(cl -> warnings.add(new ErdWarning("CLAIMED", cl.tableId(),
                                cl.session() + " 가 " + cl.expiresAt() + " 까지 작업 중인 표입니다", cl.session(), cl.expiresAt())));
            }
            return new ErdApplyResult(true, newRev, changes, warnings, null);
        });
    }

    /**
     * sinceRev 뒤에 커밋된 델타. 500건을 넘게 밀렸거나 sinceRev 가 서버 rev 보다 크면(서버가 되돌려졌거나 잘못된 값) reload=true 와 빈
     * 목록 — 호출자가 모델 전체를 다시 읽는다. rev 와 기록을 한 읽기 트랜잭션에서 읽어 사이에 낀 새 명령이 섞이지 않는다.
     */
    public ErdChangesView changesSince(String modelId, long sinceRev) {
        return readTx.execute(status -> {
            long rev = store.rev(modelId);
            if (sinceRev > rev) return new ErdChangesView(rev, true, List.of());
            return log.since(modelId, sinceRev, rev)
                    .map(ds -> new ErdChangesView(rev, false, ds))
                    .orElseGet(() -> new ErdChangesView(rev, true, List.of()));
        });
    }

    /**
     * 첫 가져오기(README S2). 서비스 안에서만 부른다 — 공개 {@link #apply} 는 restore 를 계속 거절한다(R4-3).
     * 단계 0 apply 와 같은 순서(잠금 → baseRev → DRAFT·편집자 → 표지 → 엔진 → CAS → 기록 → 커밋 뒤 발행)를 거친다.
     * 묶음은 [restore, addDiagram, placeTables] 3건이고 rev 는 1 오른다. 모델에 표가 있으면 잠근 뒤 엔진 전에 INVALID 다
     * (restore upsert 는 물리명 중복을 보지 않으므로 여기서 막지 않으면 표가 두 벌 생긴다).
     */
    public ErdApplyResult applyImport(String modelId, long baseRev, String userId, String session, String source,
                                      ErdCommand.Restore restore, List<JsonNode> diagramCommands) {
        if (baseRev < 0) return rejectedNow(modelId, invalid(0, "baseRev 는 0 이상이어야 합니다", "view 가 준 rev 를 쓰세요"));
        List<JsonNode> raw = new ArrayList<>();
        raw.add(typed(ErdCommand.class, restore));
        raw.addAll(diagramCommands);
        return applyInternal(modelId, baseRev, userId, session, source, raw, true, null, -1, true);
    }

    /**
     * 명령 하나 되돌리기(스펙 D18). 저장된 역명령을 새 명령으로 보낸다 — 충돌 판정은 엔진 Restore 가 한다(그 뒤에 같은 속성을 고친
     * 변경이 있으면 CONFLICT). 역명령은 {@code restore}·{@code restoreDiagram} 을 담으므로 직접 보내기 금지를 풀고 보낸다.
     */
    public ErdApplyResult undo(String modelId, long rev, String userId, String session, String source) {
        String[] inv = log.inverse(modelId, rev).orElse(null);
        if (inv == null) {
            return ErdApplyResult.rejected(store.rev(modelId), invalid(0, "없는 rev 입니다: " + rev, "변경 기록에서 rev 를 고르세요"));
        }
        List<JsonNode> raw = new ArrayList<>();
        try {
            ErdModelCodec.MAPPER.readTree(inv[0]).forEach(raw::add);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        if (raw.isEmpty()) {
            return ErdApplyResult.rejected(store.rev(modelId), invalid(0, "되돌릴 내용이 없는 변경입니다: rev " + rev, "다른 rev 를 고르세요"));
        }
        // 다이어그램 요소의 충돌 판정 재료: 되돌릴 rev 가 남긴 변경 후 값.
        Map<String, JsonNode> expectedAfter = new HashMap<>();
        for (ErdChange c : log.changes(modelId, rev).orElse(List.of())) {
            if (c.kind().startsWith("diagram")) expectedAfter.put(c.kind() + "|" + c.id(), c.value());
        }
        return applyInternal(modelId, -1, userId, session, source, raw, true, expectedAfter, rev, false);
    }

    /** 역명령을 op 가 붙은 JSON 으로. 구체 record 로 바로 쓰면 상위 타입의 @JsonTypeInfo(op)가 빠진다. */
    private static <T> JsonNode typed(Class<T> type, T value) {
        try {
            return ErdModelCodec.MAPPER.readTree(ErdModelCodec.MAPPER.writerFor(type).writeValueAsString(value));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static boolean isGuardCode(BusinessException e, MdmErrorCode code) {
        return e instanceof ResponseCodeAware r && code.code().equals(r.responseCode());
    }

    /** 보이는 버전의 편집자인가 — 소유자, 또는 소유자가 있는 버전의 공동 편집자(R7-1 과 같은 규칙). */
    private boolean isEditor(MdmErdModelVer v, String userId) {
        if (userId.equals(v.getOwnerId())) return true;
        return v.getOwnerId() != null
                && coEditors.isCoEditor(new VersionRef(VersionTarget.ERD_MODEL, v.getErdModelId(), v.getVer()), userId);
    }

    /** 잠그기 전 거절 — 지금 모델 rev 를 돌려준다(ErdApplyResult 계약). 모델이 없으면 ERD_MODEL_NOT_FOUND 가 그대로 난다. */
    private ErdApplyResult rejectedNow(String modelId, ErdRejection r) {
        return ErdApplyResult.rejected(store.rev(modelId), r);
    }

    /** 엔진은 모델 명령끼리만 센 자리를 돌려준다. 클라이언트 묶음의 자리로 바꾼다. */
    private static ErdRejection atClientIndex(ErdRejection r, List<Integer> modelIdx) {
        int i = r.commandIndex();
        if (i < 0 || i >= modelIdx.size()) return r;
        return new ErdRejection(r.code(), modelIdx.get(i), r.message(), r.hint(), r.elementId(), r.property(),
                r.byRev(), r.bySession(), r.current(), r.choices(), r.ownerId());
    }

    private static ErdRejection invalid(int index, String message, String hint) {
        return new ErdRejection(ErdRejection.INVALID, index, message, hint, null, null, null, null, null, null);
    }

    /** @param ownerId 그 버전의 소유자(스펙 4.5 — 공동 편집자 등록을 부탁할 사람). DRAFT 가 없으면 null. */
    private static ErdRejection notEditor(String message, String hint, String ownerId) {
        return new ErdRejection(ErdRejection.NOT_EDITOR, 0, message, hint, null, null, null, null, null, null, ownerId);
    }
}
