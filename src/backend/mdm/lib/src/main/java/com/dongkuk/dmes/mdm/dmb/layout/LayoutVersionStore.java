package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import com.dongkuk.dmes.mdm.repository.MdmLayoutVerRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;

/**
 * 레이아웃 버전 행 읽기·쓰기(D-144 3단계, {@code TB_MDM_LAYOUT_VER}). 읽기는 JPQL, 쓰기는 {@code saveAndFlush} 로 명시한다(05-02
 * I23 — 변경 감지에 기대지 않는다). 버전 비교·정렬은 Java({@link LayoutVersions})에서만 한다 — SQL 의 {@code ORDER BY VER}·
 * {@code MAX(VER)} 은 SQLite NUMERIC 친화도(1.000 은 INTEGER, 1.001 은 REAL) 때문에 쓰지 않는다. 상태·적용 구간은 공통 버전
 * 엔진이 바꾼다.
 */
@Component
public class LayoutVersionStore {

    private final EntityManager em;
    private final MdmLayoutVerRepository repository;
    private final MdmTemporalBinder temporal;

    public LayoutVersionStore(EntityManager em, MdmLayoutVerRepository repository, MdmTemporalBinder temporal) {
        this.em = em;
        this.repository = repository;
        this.temporal = temporal;
    }

    /** 최신부터 — 정렬은 Java(규칙표 #17). */
    public List<MdmLayoutVer> versions(Long layoutId) {
        return LayoutVersions.sortedDesc(em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId = :id", MdmLayoutVer.class)
                .setParameter("id", layoutId).getResultList());
    }

    public Map<Long, List<MdmLayoutVer>> versionsOf(Collection<Long> layoutIds) {
        Map<Long, List<MdmLayoutVer>> out = new LinkedHashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(layoutIds)) {
            for (MdmLayoutVer v : em.createQuery("SELECT v FROM MdmLayoutVer v WHERE v.layoutId IN :ids", MdmLayoutVer.class)
                    .setParameter("ids", chunk).getResultList()) {
                out.computeIfAbsent(v.getLayoutId(), k -> new ArrayList<>()).add(v);
            }
        }
        out.replaceAll((k, list) -> LayoutVersions.sortedDesc(list));
        return out;
    }

    /** 헤더의 RELEASED 버전 행 전부(헤더 ID → 최신부터) — EAI 표준 헤더를 시각 T 로 해석할 때 한 번 읽는다({@link LayoutVersions#eaiHeadersAt}). */
    public Map<Long, List<MdmLayoutVer>> releasedHeaderVersions() {
        Map<Long, List<MdmLayoutVer>> out = new LinkedHashMap<>();
        for (MdmLayoutVer v : em.createQuery("SELECT v FROM MdmLayoutVer v, MdmLayout l WHERE l.layoutId = v.layoutId "
                + "AND l.layoutKind = 'HEADER' AND v.status = 'RELEASED'", MdmLayoutVer.class).getResultList()) {
            out.computeIfAbsent(v.getLayoutId(), k -> new ArrayList<>()).add(v);
        }
        out.replaceAll((k, list) -> LayoutVersions.sortedDesc(list));
        return out;
    }

    public Optional<MdmLayoutVer> find(Long layoutId, BigDecimal ver) {
        return repository.findById(new MdmLayoutVerId(layoutId, VersionNumbers.scaled(ver)));
    }

    public MdmLayoutVer save(MdmLayoutVer v) {
        return repository.saveAndFlush(v);
    }

    /**
     * 이 EAI 를 쓰는 전문 버전(상태 무관) — EAI 인코딩·패딩 변경 거부에 쓴다. 헤더 버전 행도 {@code EAI_CODE}(시각 T 해석의 표준
     * 헤더 연결)를 가지므로 전문만 센다 — 헤더가 제 EAI 를 고치는 것을 제 버전 행이 막지 않게.
     */
    public List<MdmLayoutVer> messagesUsingEai(String eaiCode) {
        return em.createQuery("SELECT v FROM MdmLayoutVer v, MdmLayout l WHERE l.layoutId = v.layoutId AND l.layoutKind = 'MESSAGE' "
                        + "AND v.eaiCode = :code", MdmLayoutVer.class)
                .setParameter("code", eaiCode).getResultList();
    }

    /** 확정 기록 — 공통 엔진이 RELEASED 로 바꾼 같은 트랜잭션에서 분류·전환·스냅샷만 네이티브로 쓴다(엔티티 칼럼은 updatable=false). */
    public int recordConfirm(Long layoutId, BigDecimal ver, String switchMode, String changeKinds, String changeSummary,
                             String snapshotJson, AuditStamp stamp) {
        em.flush();
        NativeQuery<?> q = em.createNativeQuery("UPDATE TB_MDM_LAYOUT_VER SET SWITCH_MODE = :mode, CHANGE_KINDS = :kinds, "
                        + "CHANGE_SUMMARY = :summary, SNAPSHOT_JSON = :json, U_USR_ID = :uUsrId, U_AT = :uAt, U_SVC_ID = :uSvcId, "
                        + "U_PGM_ID = :uPgmId, AUD_VER = COALESCE(AUD_VER, 0) + 1 "
                        + "WHERE LAYOUT_ID = :id AND VER = :ver AND STATUS = 'RELEASED'")
                .unwrap(NativeQuery.class);
        q.setParameter("mode", switchMode, String.class);
        q.setParameter("kinds", changeKinds, String.class);
        q.setParameter("summary", changeSummary, String.class);
        q.setParameter("json", snapshotJson, String.class);
        q.setParameter("uUsrId", stamp.userId(), String.class);
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        q.setParameter("uSvcId", stamp.serviceId(), String.class);
        q.setParameter("uPgmId", stamp.programId(), String.class);
        q.setParameter("id", layoutId);
        q.setParameter("ver", VersionNumbers.scaled(ver));
        return q.executeUpdate();
    }
}
