package com.dongkuk.dmes.mcm.widget.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Repository;

/**
 * 탭 공유 받는 사람 고르기·확인용 사용자 조회(design-widget-tabs.md §3.1 shareTab·searchUsers). 사용 중 사용자 =
 * {@code USE_TP='Y'} 이고 마감일(END_ACTIVE_DATE)이 없거나 아직 오지 않은 사용자({@code SecUserRepository.findActiveUserIds} 와 같은 판정).
 * <p>Spring Data 인터페이스가 아니라 EntityManager 클래스다 — 이 패키지를 저장소 스캔하는 위젯 시험 구성이 사용자 엔티티를 올리지 않아도
 * 컨텍스트가 뜨게 한다. 돌려주는 칸은 userId·userNm·deptNm 뿐이다.
 */
@Repository
public class WidgetUserLookupRepository {

    /** LIKE 이스케이프 문자. 백슬래시는 방언마다 문자열 리터럴 해석이 달라 쓰지 않는다. */
    static final char LIKE_ESCAPE = '!';

    /** 사용자 고르기 한 줄. */
    public record UserRow(String userId, String userNm, String deptNm) {}

    @PersistenceContext(unitName = "default")
    private EntityManager em;

    public WidgetUserLookupRepository() {}

    /** 시험용 — EntityManager 를 직접 넣는다. */
    public WidgetUserLookupRepository(EntityManager em) {
        this.em = em;
    }

    /**
     * 아이디·이름에 keyword 가 들어간(대소문자 무시) 사용 중 사용자, 이름·아이디 순 최대 limit 건. excludeUserId(본인)는 뺀다.
     * keyword 의 {@code %}·{@code _}·이스케이프 문자는 글자 그대로 찾는다.
     */
    public List<UserRow> searchActive(String keyword, String excludeUserId, LocalDateTime now, int limit) {
        String pattern = "%" + escapeLike(keyword.toUpperCase(Locale.ROOT)) + "%";
        List<Object[]> rows = em.createQuery("""
                        select u.userId, u.userNm, d.deptNm
                        from McmSecUser u left join DeptInfo d on d.deptCd = u.deptCd
                        where u.useTp = 'Y'
                          and (u.endActiveDate is null or u.endActiveDate > :now)
                          and u.userId <> :me
                          and (upper(u.userId) like :pattern escape '!' or upper(u.userNm) like :pattern escape '!')
                        order by u.userNm, u.userId
                        """, Object[].class)
                .setParameter("now", now)
                .setParameter("me", excludeUserId)
                .setParameter("pattern", pattern)
                .setMaxResults(limit)
                .getResultList();
        List<UserRow> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) out.add(new UserRow((String) r[0], (String) r[1], (String) r[2]));
        return out;
    }

    /** userIds 중 사용 중인 사용자 ID. */
    public List<String> findActiveUserIds(Collection<String> userIds, LocalDateTime now) {
        if (userIds.isEmpty()) return List.of();
        return em.createQuery("""
                        select u.userId from McmSecUser u
                        where u.userId in :ids
                          and u.useTp = 'Y'
                          and (u.endActiveDate is null or u.endActiveDate > :now)
                        """, String.class)
                .setParameter("ids", userIds)
                .setParameter("now", now)
                .getResultList();
    }

    /** 사용자의 부서 코드(없거나 빈 값이면 null). */
    public String findDeptCd(String userId) {
        List<String> rows = em.createQuery("select u.deptCd from McmSecUser u where u.userId = :id", String.class)
                .setParameter("id", userId)
                .getResultList();
        String deptCd = rows.isEmpty() ? null : rows.get(0);
        return deptCd == null || deptCd.isBlank() ? null : deptCd;
    }

    /** LIKE 와일드카드({@code %}·{@code _})와 이스케이프 문자를 글자로 바꾼다. */
    static String escapeLike(String s) {
        StringBuilder b = new StringBuilder(s.length() + 4);
        for (char c : s.toCharArray()) {
            if (c == '%' || c == '_' || c == LIKE_ESCAPE) b.append(LIKE_ESCAPE);
            b.append(c);
        }
        return b.toString();
    }
}
