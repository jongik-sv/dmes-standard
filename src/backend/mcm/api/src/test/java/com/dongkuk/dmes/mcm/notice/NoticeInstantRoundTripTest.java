package com.dongkuk.dmes.mcm.notice;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.notice.entity.Notice;
import com.dongkuk.dmes.mcm.notice.repository.NoticeRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

/**
 * Instant 감사 칸(C_AT)의 Oracle 왕복 — mcm-core 가 넘긴 조건 1(oracle-1007, docs/oracle-1007/memo-ora-mcm-core.md 「넘길 조건」).
 *
 * <p>공통 결정은 KST 통일이다: {@code hibernate.jdbc.time_zone} 없이 {@code preferred_instant_jdbc_type=TIMESTAMP} 로
 * {@code TIMESTAMP(6)} 칸에 JVM 기본 시간대(Asia/Seoul)의 벽시계를 저장한다. 형식 검사(validate)는 앞부분만 맞춰 보므로
 * 값을 넣고 읽어 확인한다.
 * <ul>
 *   <li>JPA 로 저장한 C_AT 를 JDBC 로 원값({@code TIMESTAMP}) 그대로 읽으면 JVM 기본 시간대의 벽시계다.</li>
 *   <li>같은 칸을 엔티티로 다시 읽으면 저장한 Instant 와 같다(마이크로초까지).</li>
 *   <li>DB 시계({@code SYSTIMESTAMP}, 컨테이너 TZ Asia/Seoul)로 시드가 넣는 값과 같은 벽시계 축이다 — 차이가 몇 분 안이다.</li>
 * </ul>
 */
@Transactional
class NoticeInstantRoundTripTest extends McmNoticeTestDb {

    @Autowired
    NoticeRepository notices;

    @Autowired
    DataSource dataSource;

    @PersistenceContext(unitName = "default")
    EntityManager em;

    @Test
    @DisplayName("JPA 가 저장한 Instant C_AT 는 KST 벽시계 TIMESTAMP 로 들어가고, 다시 읽으면 같은 Instant 다")
    void instantAuditColumnRoundTrip() {
        Notice n = new Notice("NTRT000001");
        n.setTitle("왕복");
        n.setNoticeStatus("DRAFT");
        n.setContentFormat("TEXT");
        n.setNoticeCategory("GENERAL");
        n.setPinYn("N");
        n.setTargetScope("ALL");
        // id 를 직접 넣는 엔티티라 save 는 merge 로 가고, @PrePersist 는 merge 가 만든 관리 사본에 C_AT 를 채운다 — 반환값을 쓴다.
        Notice persisted = notices.saveAndFlush(n);
        assertThat(persisted.getCreatedAt()).isNotNull();
        // TIMESTAMP(6) 은 마이크로초까지 담는다 — Instant.now() 의 남는 자리는 잘라 비교한다.
        Instant saved = persisted.getCreatedAt().truncatedTo(ChronoUnit.MICROS);

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        // 같은 트랜잭션 연결로 읽는다(@Transactional 이 JDBC 연결도 묶는다).
        Timestamp raw = jdbc.queryForObject("SELECT C_AT FROM MCMAPUSER.TB_MCM_NOTICE WHERE NOTICE_ID = 'NTRT000001'",
                Timestamp.class);
        LocalDateTime wall = raw.toLocalDateTime();
        LocalDateTime expectedWall = LocalDateTime.ofInstant(saved, ZoneId.systemDefault());
        assertThat(wall).as("C_AT 원값 = JVM 기본 시간대(%s) 벽시계", ZoneId.systemDefault()).isEqualTo(expectedWall);

        Timestamp dbNow = jdbc.queryForObject("SELECT CAST(SYSTIMESTAMP AS TIMESTAMP) FROM DUAL", Timestamp.class);
        assertThat(Duration.between(wall, dbNow.toLocalDateTime()).abs())
                .as("DB 시계(SYSTIMESTAMP, 컨테이너 TZ)와 같은 벽시계 축 — 시간대가 어긋나면 몇 시간 차이가 난다")
                .isLessThan(Duration.ofMinutes(5));

        em.clear();
        Notice reloaded = notices.findById("NTRT000001").orElseThrow();
        assertThat(reloaded.getCreatedAt().truncatedTo(ChronoUnit.MICROS)).isEqualTo(saved);
    }
}
