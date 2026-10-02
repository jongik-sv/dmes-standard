package com.dongkuk.dmes.mdm.common.version;

import static com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns.U_AT;
import static com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns.U_PGM_ID;
import static com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns.U_SVC_ID;
import static com.dongkuk.dmes.mdm.contract.common.MdmAuditColumns.U_USR_ID;
import static com.dongkuk.dmes.mdm.contract.version.VersionConventions.ROW_VERSION_COLUMN;
import static com.dongkuk.dmes.mdm.contract.version.VersionConventions.ROW_VERSION_STEP;

import com.dongkuk.dmes.mdm.common.support.MdmTemporalBinder;
import com.dongkuk.dmes.mdm.contract.common.AuditStamp;
import com.dongkuk.dmes.mdm.contract.version.MaruObjectStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStatus;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.hibernate.query.NativeQuery;
import org.springframework.stereotype.Repository;

/**
 * 버전 행·부모 상태의 JPA native 쿼리 전용 저장소(TSK-01-03 B14, 규칙표 §4).
 *
 * <p>규칙:
 * <ul>
 *   <li>테이블·칼럼 이름은 {@link VersionTableSpec} 과 고정 칼럼 상수에서만 온다. 이름이 {@code ^[A-Z][A-Z0-9_]*$} 가
 *       아니면 SQL 을 만들기 전에 거부한다. 값은 모두 바인딩 파라미터다(불변 규칙 I17).</li>
 *   <li>모든 쓰기는 감사 U_* 칼럼을 명시하고, 명세에 그 테이블의 감사 카운터가 있으면 1 올린다(규칙표 §2, D-034, I16).</li>
 *   <li>일시는 {@link MdmTemporalBinder} 를 거친다. DB 시각 함수를 쓰지 않는다(규칙표 #16, I15).</li>
 *   <li>버전 비교·정렬은 SQL 이 아니라 Java 에서 한다(규칙표 #17: SQLite NUMERIC 친화도).</li>
 *   <li>호출자 트랜잭션 안에서만 쓴다. native UPDATE 는 관리 엔티티를 갱신하지 않으므로 쿼리 전에 flush 한다.</li>
 * </ul>
 */
@Repository
public class VersionRowStore {

    private static final Pattern NAME = Pattern.compile("^[A-Z][A-Z0-9_]*$");

    static final String STATUS = "STATUS";
    static final String OWNER_ID = "OWNER_ID";
    static final String APPLY_FROM = "APPLY_FROM";
    static final String APPLY_TO = "APPLY_TO";
    static final String REQUESTED_BY = "REQUESTED_BY";
    static final String REQUESTED_AT = "REQUESTED_AT";
    static final String RELEASED_AT = "RELEASED_AT";

    private static final String DRAFT = VersionStatus.DRAFT.name();
    private static final String RELEASED = VersionStatus.RELEASED.name();

    private final EntityManager entityManager;
    private final VersionTableRegistry registry;
    private final MdmTemporalBinder temporal;

    public VersionRowStore(EntityManager entityManager, VersionTableRegistry registry, MdmTemporalBinder temporal) {
        this.entityManager = entityManager;
        this.registry = registry;
        this.temporal = temporal;
    }

    public Optional<VersionRow> find(VersionRef ref) {
        VersionTableSpec spec = spec(ref.target());
        String sql = selectColumns(spec) + " FROM " + spec.versionTable() + keyWhere(spec);
        List<?> rows = bindKey(query(sql), ref).getResultList();
        return rows.isEmpty() ? Optional.empty() : Optional.of(toRow(ref.target(), (Object[]) rows.get(0)));
    }

    public List<VersionRow> findAll(VersionTarget target, String objectId) {
        VersionTableSpec spec = spec(target);
        String sql = selectColumns(spec) + " FROM " + spec.versionTable() + " WHERE " + spec.objectIdColumn() + " = :objectId";
        List<?> rows = query(sql).setParameter("objectId", objectId).getResultList();
        List<VersionRow> result = new ArrayList<>(rows.size());
        for (Object row : rows) {
            result.add(toRow(target, (Object[]) row));
        }
        return result;
    }

    /** DRAFT → RELEASED 조건부 UPDATE. 결재 칸은 REQUESTED_BY/AT·RELEASED_AT 만 쓴다(ADR-0002 D3·D5). */
    public int casConfirm(VersionRef ref, long expected, LocalDateTime applyFrom, String confirmerId,
                          LocalDateTime now, AuditStamp stamp) {
        VersionTableSpec spec = spec(ref.target());
        String sql = "UPDATE " + spec.versionTable() + " SET " + STATUS + " = '" + RELEASED + "', "
                + APPLY_FROM + " = :applyFrom, " + APPLY_TO + " = :applyTo, "
                + REQUESTED_BY + " = :confirmerId, " + REQUESTED_AT + " = :now, " + RELEASED_AT + " = :now, "
                + rowVersionBump() + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + draftAndRowVersion();
        NativeQuery<?> q = bindKey(query(sql), ref)
                .setParameter("applyFrom", temporal.toDb(applyFrom))
                .setParameter("applyTo", temporal.toDb(VersionConventions.OPEN_END))
                .setParameter("now", temporal.toDb(now))
                .setParameter("expected", expected);
        bindString(q, "confirmerId", confirmerId);
        return bindAudit(q, stamp).executeUpdate();
    }

    /** 직전 RELEASED 의 적용 구간을 새 버전의 apply_from 에서 닫는다. */
    public int closeApplyTo(VersionRef prev, LocalDateTime applyTo, AuditStamp stamp) {
        VersionTableSpec spec = spec(prev.target());
        String sql = "UPDATE " + spec.versionTable() + " SET " + APPLY_TO + " = :applyTo"
                + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + " AND " + STATUS + " = '" + RELEASED + "'";
        NativeQuery<?> q = bindKey(query(sql), prev).setParameter("applyTo", temporal.toDb(applyTo));
        return bindAudit(q, stamp).executeUpdate();
    }

    /**
     * OWNER_ID 조건부 변경(선점·해제·넘기기). {@code newOwnerOrNull} 이 null 이면 소유자를 비운다.
     * {@code requireOwnerNull} 이면 비어 있을 때만 바꾼다(선점).
     */
    public int casSetOwner(VersionRef ref, long expected, String newOwnerOrNull, boolean requireOwnerNull,
                           AuditStamp stamp) {
        VersionTableSpec spec = spec(ref.target());
        String ownerValue = newOwnerOrNull == null ? "NULL" : ":newOwner";
        String sql = "UPDATE " + spec.versionTable() + " SET " + OWNER_ID + " = " + ownerValue + ", "
                + rowVersionBump() + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + draftAndRowVersion()
                + (requireOwnerNull ? " AND " + OWNER_ID + " IS NULL" : "");
        NativeQuery<?> q = bindKey(query(sql), ref).setParameter("expected", expected);
        if (newOwnerOrNull != null) {
            q.setParameter("newOwner", newOwnerOrNull);
        }
        return bindAudit(q, stamp).executeUpdate();
    }

    /** DRAFT 저장 직전 row_version 만 올린다. */
    public int casBumpRowVersion(VersionRef ref, long expected, AuditStamp stamp) {
        VersionTableSpec spec = spec(ref.target());
        String sql = "UPDATE " + spec.versionTable() + " SET " + rowVersionBump() + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + draftAndRowVersion();
        NativeQuery<?> q = bindKey(query(sql), ref).setParameter("expected", expected);
        return bindAudit(q, stamp).executeUpdate();
    }

    public int casDeleteDraft(VersionRef ref, long expected) {
        VersionTableSpec spec = spec(ref.target());
        String sql = "DELETE FROM " + spec.versionTable() + keyWhere(spec) + draftAndRowVersion();
        return bindKey(query(sql), ref).setParameter("expected", expected).executeUpdate();
    }

    /**
     * 확정 취소 RELEASED → DRAFT 조건부 UPDATE(ADR-0002 D8-4·D8-5·D8-15).
     *
     * <p>{@code STATUS}·{@code APPLY_FROM}·{@code APPLY_TO}·{@code ROW_VERSION} 와 감사 칼럼만 쓴다. 확정 칸
     * ({@code REQUESTED_BY}·{@code REQUESTED_AT}·{@code RELEASED_AT})은 <b>지우지 않는다</b> — 확정자를 되찾을 수단이
     * 사라지지 않고 "확정 후 취소" 흔적이 감사에서 남는다.
     *
     * <p>술어는 {@code STATUS='RELEASED'}(확정의 {@code STATUS='DRAFT'} 와 별개)다. 공용 헬퍼를 바꾸면 {@link #casConfirm}·
     * {@link #casSetOwner}·{@link #casBumpRowVersion}·{@link #casDeleteDraft} 가 함께 오염된다.
     */
    public int casCancelConfirm(VersionRef ref, long expected, AuditStamp stamp) {
        VersionTableSpec spec = spec(ref.target());
        String sql = "UPDATE " + spec.versionTable() + " SET " + STATUS + " = '" + DRAFT + "', "
                + APPLY_FROM + " = NULL, " + APPLY_TO + " = NULL, "
                + rowVersionBump() + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + releasedAndRowVersion();
        NativeQuery<?> q = bindKey(query(sql), ref).setParameter("expected", expected);
        return bindAudit(q, stamp).executeUpdate();
    }

    /**
     * 직전 {@code RELEASED} 의 적용 구간을 다시 연다 — {@link #closeApplyTo} 의 역연산(ADR-0002 D8-6).
     *
     * <p>확정이 직전 버전의 {@code APPLY_TO} 를 새 버전의 {@code apply_from} 으로 닫았으므로, 확정 취소만 하면 그 뒤가 빈
     * 구간이 된다. 대상은 "자신보다 {@code ver} 가 작은 {@code RELEASED} 가운데 최대"(확정이 쓰는 대상과 같다)다.
     */
    public int reopenApplyTo(VersionRef prev, AuditStamp stamp) {
        VersionTableSpec spec = spec(prev.target());
        String sql = "UPDATE " + spec.versionTable() + " SET " + APPLY_TO + " = :openEnd"
                + auditSet(spec.auditCounterColumn())
                + keyWhere(spec) + " AND " + STATUS + " = '" + RELEASED + "'";
        NativeQuery<?> q = bindKey(query(sql), prev)
                .setParameter("openEnd", temporal.toDb(VersionConventions.OPEN_END));
        return bindAudit(q, stamp).executeUpdate();
    }

    /** 부모 CREATED → INUSE. 이미 INUSE·DEPRECATED 면 손대지 않는다(ADR-0002 D6, D8). */
    public int markParentInUse(VersionTarget target, String objectId, AuditStamp stamp) {
        VersionTableSpec spec = spec(target);
        String sql = "UPDATE " + spec.parentTable() + " SET " + STATUS + " = '" + MaruObjectStatus.INUSE.name() + "'"
                + auditSet(spec.parentAuditCounterColumn())
                + " WHERE " + spec.parentObjectIdColumn() + " = :objectId"
                + " AND " + STATUS + " = '" + MaruObjectStatus.CREATED.name() + "'";
        NativeQuery<?> q = query(sql).setParameter("objectId", objectId);
        return bindAudit(q, stamp).executeUpdate();
    }

    // ── SQL 조립 ──────────────────────────────────────────────────────────────

    private VersionTableSpec spec(VersionTarget target) {
        VersionTableSpec spec = registry.spec(target);
        requireName(spec.versionTable());
        requireName(spec.objectIdColumn());
        requireName(spec.versionColumn());
        requireName(spec.parentTable());
        requireName(spec.parentObjectIdColumn());
        if (spec.auditCounterColumn() != null) {
            requireName(spec.auditCounterColumn());
        }
        if (spec.parentAuditCounterColumn() != null) {
            requireName(spec.parentAuditCounterColumn());
        }
        return spec;
    }

    private static void requireName(String name) {
        if (name == null || !NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("테이블·칼럼 이름은 ^[A-Z][A-Z0-9_]*$ 여야 합니다: " + name);
        }
    }

    /**
     * VER 는 문자열로 읽는다. SQLite NUMERIC 친화도는 {@code 1.000} 을 INTEGER, {@code 1.001} 을 REAL 로 저장해 행마다
     * 저장 형식이 다르고, 결과 타입을 첫 행으로 정하면 뒤 행의 소수부가 잘린다(Build 실측, 규칙표 #17).
     *
     * <p>객체 ID CAST 폭은 ID 상한(NamingRules.CODE_MAX = 50)보다 넓은 64 로 둔다.
     *
     * <p>객체 ID 도 문자열로 읽는다 — 레이아웃 ID 는 INTEGER 다. 바인딩은 문자열 그대로 둔다: SQLite 는 INTEGER 친화도
     * 칼럼과 비교할 때 바인딩된 문자열에 수치 친화도를 적용한다(D-144 3단계 실측, {@code VersionRowStoreIntegerIdSqliteTest}).
     */
    private static String selectColumns(VersionTableSpec spec) {
        return "SELECT CAST(" + spec.objectIdColumn() + " AS VARCHAR(64)), CAST(" + spec.versionColumn() + " AS VARCHAR(40)), "
                + STATUS + ", " + OWNER_ID + ", "
                + APPLY_FROM + ", " + APPLY_TO + ", " + ROW_VERSION_COLUMN;
    }

    private static String keyWhere(VersionTableSpec spec) {
        return " WHERE " + spec.objectIdColumn() + " = :objectId AND " + spec.versionColumn() + " = :ver";
    }

    private static String draftAndRowVersion() {
        return " AND " + STATUS + " = '" + DRAFT + "' AND " + ROW_VERSION_COLUMN + " = :expected";
    }

    /** 확정 취소용 술어 — {@link #draftAndRowVersion()} 와 상태만 다르다(ADR-0002 D8-15). */
    private static String releasedAndRowVersion() {
        return " AND " + STATUS + " = '" + RELEASED + "' AND " + ROW_VERSION_COLUMN + " = :expected";
    }

    private static String rowVersionBump() {
        return ROW_VERSION_COLUMN + " = " + ROW_VERSION_COLUMN + " + " + ROW_VERSION_STEP;
    }

    /** 감사 U_* 칼럼과, 그 테이블에 감사 카운터가 있으면 카운터 +1. 카운터 이름은 테이블마다 다르다(D-034). */
    private static String auditSet(String counter) {
        String set = ", " + U_USR_ID + " = :uUsrId, " + U_AT + " = :uAt, " + U_SVC_ID + " = :uSvcId, "
                + U_PGM_ID + " = :uPgmId";
        return counter == null ? set : set + ", " + counter + " = COALESCE(" + counter + ", 0) + 1";
    }

    // ── 바인딩·읽기 ────────────────────────────────────────────────────────────

    private NativeQuery<?> query(String sql) {
        entityManager.flush();
        return entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
    }

    private static NativeQuery<?> bindKey(NativeQuery<?> q, VersionRef ref) {
        return q.setParameter("objectId", ref.objectId())
                .setParameter("ver", ref.ver().setScale(ref.target().versionScale()));
    }

    private NativeQuery<?> bindAudit(NativeQuery<?> q, AuditStamp stamp) {
        q.setParameter("uAt", temporal.toDb(stamp.at()));
        bindString(q, "uUsrId", stamp.userId());
        bindString(q, "uSvcId", stamp.serviceId());
        bindString(q, "uPgmId", stamp.programId());
        return q;
    }

    /** null 도 문자열 타입으로 바인딩한다(드라이버가 타입 없는 null 을 다른 타입으로 추론하지 않게 한다). */
    private static void bindString(NativeQuery<?> q, String name, String value) {
        q.setParameter(name, value, String.class);
    }

    private VersionRow toRow(VersionTarget target, Object[] row) {
        BigDecimal ver = new BigDecimal(row[1].toString()).setScale(target.versionScale());
        VersionRef ref = new VersionRef(target, (String) row[0], ver);
        return new VersionRow(ref, (String) row[2], (String) row[3],
                temporal.fromDb(row[4]), temporal.fromDb(row[5]), ((Number) row[6]).longValue());
    }
}
