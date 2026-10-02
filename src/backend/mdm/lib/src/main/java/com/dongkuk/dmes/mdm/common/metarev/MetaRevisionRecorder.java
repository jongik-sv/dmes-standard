package com.dongkuk.dmes.mdm.common.metarev;

import com.dongkuk.dmes.mdm.common.dictionary.DomainImpactQueries;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeRemoval;
import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.common.MdmNativeAuditSupport;
import jakarta.persistence.EntityManager;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * MDM 메타 변경 기록기(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.2). 원장 쓰기 서비스가 쓰기 직후
 * "무엇이 바뀌었는지"만 넘기면, 업무 모듈 캐시 키로 펼쳐 {@code TB_MDM_META_REV} 에 쌓는다.
 *
 * <p>트랜잭션: {@link TransactionTemplate}(REQUIRED) 로 감싸 호출자 트랜잭션(OASIS action·서비스 TransactionTemplate)에 합류한다 —
 * 원장이 롤백되면 기록도 롤백된다. 호출자 트랜잭션이 없으면(서비스 직접 호출 시험) 스스로 연다. {@code @Transactional} 은 쓰지 않는다.
 *
 * <p>쓰기는 여러 행 VALUES 네이티브 INSERT 한 문장이다({@link #CHUNK} 행씩). 키 수와 무관하게 SQL 문이 하나라 서비스의 SQL 문 수 가드가
 * 키 수만큼 늘지 않는다(Ruling R1). SQLite·PostgreSQL·MSSQL·Oracle 23ai 가 받는 문법이다(운영 DB 미정 — ADR-0004).
 */
@Component
public class MetaRevisionRecorder {

    static final int CHUNK = 200;
    private static final String INSERT_HEAD = "INSERT INTO TB_MDM_META_REV (TARGET_TYPE, TARGET_KEY, CHANGE_KIND, "
            + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) VALUES ";

    private final EntityManager entityManager;
    private final DomainImpactQueries domainQueries;
    private final MasterCodeRemoval codeRemoval;
    private final MdmNativeAuditSupport audit;
    private final MdmTemporalBinder temporal;
    private final TransactionTemplate tx;
    private final List<LayoutColumnUsers> layoutUsers;

    public MetaRevisionRecorder(EntityManager entityManager, DomainImpactQueries domainQueries, MasterCodeRemoval codeRemoval,
                                MdmNativeAuditSupport audit, MdmTemporalBinder temporal, PlatformTransactionManager transactionManager,
                                List<LayoutColumnUsers> layoutUsers) {
        this.entityManager = entityManager;
        this.layoutUsers = List.copyOf(layoutUsers);
        this.domainQueries = domainQueries;
        this.codeRemoval = codeRemoval;
        this.audit = audit;
        this.temporal = temporal;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** 강제 기록이 더한 순번 범위. */
    public record MetaRevisionRange(long fromSeq, long toSeq, int count) {
    }

    /** 컬럼 저장 — {@link #column(String, String, boolean)} 의 레이아웃 펼침을 켠 쪽(의심스러우면 거는 쪽, spec §3.3). */
    public void column(String oldPhysName, String newPhysName) {
        column(oldPhysName, newPhysName, true);
    }

    /**
     * 컬럼 저장 — 두 물리명 모두(같으면 하나). 신규는 {@code oldPhysName} 이 null. {@code layoutFeedMayChange} 면 두 물리명을 쓰는 RELEASED
     * 전문(헤더면 쌓은 전문까지)을 LAYOUT 키로 더한다 — 전문 합성은 항목의 타입·단위·소수를 그때의 컬럼 사전에서 읽는다(검토 I1). 물리명이
     * 바뀌면 옛 이름을 쓰는 항목이 사전을 잃으므로 옛 이름도 찾는다. 펼침 조회와 기록은 한 트랜잭션(호출자 합류)에서 한 문장으로 남긴다.
     */
    public void column(String oldPhysName, String newPhysName, boolean layoutFeedMayChange) {
        tx.executeWithoutResult(status -> {
            Set<Key> keys = new LinkedHashSet<>();
            add(keys, MetaTargetType.COLUMN, oldPhysName);
            add(keys, MetaTargetType.COLUMN, newPhysName);
            if (layoutFeedMayChange) {
                addLayoutsUsing(keys, physNames(oldPhysName, newPhysName));
            }
            insert(keys, MetaChangeKind.SAVE);
        });
    }

    /** 도메인 저장 — {@link #domain(Long, boolean)} 의 레이아웃 펼침을 켠 쪽. */
    public void domain(Long domainId) {
        domain(domainId, true);
    }

    /**
     * 도메인 저장 — 그 도메인 + 하위 도메인 전부 + 그 도메인들을 참조하는 컬럼 전부. {@code layoutFeedMayChange} 면 그 컬럼들을 쓰는 RELEASED
     * 전문까지 LAYOUT 키로 더한다(검토 I1 — 유효 타입·단위·소수가 하위로 상속된다).
     */
    public void domain(Long domainId, boolean layoutFeedMayChange) {
        tx.executeWithoutResult(status -> {
            Set<Key> keys = new LinkedHashSet<>();
            Set<String> phys = new LinkedHashSet<>();
            expandDomain(domainId, keys, phys);
            if (layoutFeedMayChange) {
                addLayoutsUsing(keys, phys);
            }
            insert(keys, MetaChangeKind.SAVE);
        });
    }

    public void rule(String ruleId) {
        Set<Key> keys = new LinkedHashSet<>();
        add(keys, MetaTargetType.RULE, ruleId);
        write(keys, MetaChangeKind.SAVE);
    }

    public void ruleSet(String setId) {
        Set<Key> keys = new LinkedHashSet<>();
        add(keys, MetaTargetType.RULE_SET, setId);
        write(keys, MetaChangeKind.SAVE);
    }

    /** 마스터코드 — 그 코드 + {@code MARU_CODE_ID} 로 직접 참조하는 도메인 각각의 도메인 펼침. */
    public void code(String maruCodeId) {
        tx.executeWithoutResult(status -> {
            Set<Key> keys = new LinkedHashSet<>();
            add(keys, MetaTargetType.CODE, maruCodeId);
            if (maruCodeId != null && !maruCodeId.isBlank()) {
                for (String domainId : codeRemoval.referencingDomainIds(maruCodeId)) {
                    expandDomain(Long.valueOf(domainId), keys);
                }
            }
            insert(keys, MetaChangeKind.SAVE);
        });
    }

    public void layouts(Collection<Long> layoutIds) {
        Set<Key> keys = new LinkedHashSet<>();
        for (Long id : layoutIds) {
            add(keys, MetaTargetType.LAYOUT, id == null ? null : String.valueOf(id));
        }
        write(keys, MetaChangeKind.SAVE);
    }

    /** 화면 삭제·재등록(spec §3.4 force) — 펼치지 않는다. */
    public MetaRevisionRange force(MetaTargetType type, Collection<String> keys, MetaChangeKind kind) {
        return tx.execute(status -> {
            Set<Key> set = new LinkedHashSet<>();
            for (String k : keys) {
                add(set, type, k);
            }
            int written = insert(set, kind);
            Number max = (Number) entityManager.createNativeQuery("SELECT MAX(REV_SEQ) FROM TB_MDM_META_REV").getSingleResult();
            long to = max == null ? 0L : max.longValue();
            return new MetaRevisionRange(written == 0 ? to : to - written + 1, to, written);
        });
    }

    private void expandDomain(Long domainId, Set<Key> keys) {
        expandDomain(domainId, keys, new LinkedHashSet<>());
    }

    /** {@code phys} 에 참조 컬럼 물리명을 저장된 글자 그대로 모은다(COLUMN 키는 대문자로 바뀌므로 키에서 다시 뽑지 않는다). */
    private void expandDomain(Long domainId, Set<Key> keys, Set<String> phys) {
        if (domainId == null) {
            return;
        }
        add(keys, MetaTargetType.DOMAIN, String.valueOf(domainId));
        for (DomainImpactQueries.SubtreeRow r : domainQueries.subtree(domainId)) {
            add(keys, MetaTargetType.DOMAIN, String.valueOf(r.domainId()));
            add(keys, MetaTargetType.COLUMN, r.physName());
            if (r.physName() != null && !r.physName().isBlank()) {
                phys.add(r.physName());
            }
        }
    }

    /** 이 물리명들을 쓰는 RELEASED 전문(헤더면 쌓은 전문까지)을 LAYOUT 키로 — {@link LayoutColumnUsers}. 호출자 트랜잭션 안에서만. */
    private void addLayoutsUsing(Set<Key> keys, Collection<String> phys) {
        if (phys.isEmpty()) {
            return;
        }
        for (LayoutColumnUsers users : layoutUsers) {
            for (Long id : users.layoutIdsUsing(phys)) {
                add(keys, MetaTargetType.LAYOUT, id == null ? null : String.valueOf(id));
            }
        }
    }

    private static Set<String> physNames(String... names) {
        Set<String> out = new LinkedHashSet<>();
        for (String n : names) {
            if (n != null && !n.isBlank()) {
                out.add(n.trim());
            }
        }
        return out;
    }

    private static void add(Set<Key> keys, MetaTargetType type, String key) {
        if (key == null || key.isBlank()) {
            return;
        }
        String k = key.trim();
        keys.add(new Key(type, type == MetaTargetType.COLUMN ? k.toUpperCase(Locale.ROOT) : k));
    }

    private void write(Set<Key> keys, MetaChangeKind kind) {
        if (keys.isEmpty()) {
            return;
        }
        tx.executeWithoutResult(status -> insert(keys, kind));
    }

    /** 호출자 트랜잭션 안에서만 부른다. 돌려주는 값은 넣은 행 수. */
    private int insert(Collection<Key> keys, MetaChangeKind kind) {
        if (keys.isEmpty()) {
            return 0;
        }
        AuditStamp stamp = audit.currentStamp();
        Object at = temporal.toDb(stamp.at());
        List<Key> all = List.copyOf(keys);
        int written = 0;
        for (int from = 0; from < all.size(); from += CHUNK) {
            List<Key> chunk = all.subList(from, Math.min(all.size(), from + CHUNK));
            StringBuilder sql = new StringBuilder(INSERT_HEAD);
            for (int i = 0; i < chunk.size(); i++) {
                sql.append(i == 0 ? "" : ", ").append("(:t").append(i).append(", :k").append(i)
                        .append(", :kind, :usr, :at, :svc, :pgm, :usr, :at, :svc, :pgm, 0)");
            }
            NativeQuery<?> q = entityManager.createNativeQuery(sql.toString()).unwrap(NativeQuery.class);
            for (int i = 0; i < chunk.size(); i++) {
                q.setParameter("t" + i, chunk.get(i).type().name());
                q.setParameter("k" + i, chunk.get(i).key());
            }
            q.setParameter("kind", kind.name());
            q.setParameter("usr", stamp.userId(), String.class);
            q.setParameter("svc", stamp.serviceId(), String.class);
            q.setParameter("pgm", stamp.programId(), String.class);
            q.setParameter("at", at);
            written += q.executeUpdate();
        }
        return written;
    }

    private record Key(MetaTargetType type, String key) {
    }
}
