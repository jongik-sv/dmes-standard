package com.dongkuk.dmes.mcm.userq.repository;

import com.dongkuk.dmes.mcm.userq.entity.UserQueryAssign;
import com.dongkuk.dmes.mcm.userq.entity.UserQueryAssignId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

/** {@code MCMAPUSER.TB_MCM_USRQ_ASSIGN} — 스펙 2026-10-10-user-query-program-design §2. */
public interface UserQueryAssignRepository extends JpaRepository<UserQueryAssign, UserQueryAssignId> {

    /** 할당 탭(searchAssign)·saveAssign 차이 계산용 — 한 정의의 할당 전체. */
    List<UserQueryAssign> findByQueryIdOrderByUserIdAsc(String queryId);

    /** 정의 삭제 때 할당 먼저 지우기 — 쓰기 action 의 트랜잭션 안에서 부른다. */
    @Modifying
    @Query("DELETE FROM UserQueryAssign a WHERE a.queryId = :queryId")
    int deleteByQueryId(String queryId);

    /** getDef·run 의 할당 재확인(IDOR). */
    boolean existsByQueryIdAndUserId(String queryId, String userId);
}
