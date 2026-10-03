package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.sqlite.SQLiteErrorCode;
import org.sqlite.SQLiteException;

/**
 * 로컬 SQLite 에서 SQLITE_BUSY 로 실패한 트랜잭션을 통째로 다시 시도한다(2026-10-03, 로그인 전용).
 *
 * <p>cactus AuthService.login 은 한 트랜잭션에서 사용자를 읽고(SHARED) 비밀번호 검증 뒤 PWD_FAIL_COUNT 를 쓴다. 그사이 다른
 * 연결(RevokedTokenPurger DELETE·다른 로그인)이 RESERVED 이상을 쥐면 SQLite 는 승격하려는 쪽에 busy handler 없이 바로
 * SQLITE_BUSY 를 돌려준다(교착 회피, 드라이버 기본 busy_timeout 3초와 무관) → 500 → 포털 401. 롤백으로 SHARED 를 놓으면
 * 상대가 끝나므로 처음부터 다시 하면 된다. 로그인은 resetTryCnt 전에 부수효과가 없고 실패 경로도 롤백 뒤 다시 읽으므로
 * 다시 시도해도 실패 횟수가 두 번 오르지 않는다.
 *
 * <p>트랜잭션 프록시 바깥(컨트롤러)에서 불러야 한다. 풀 전체 IMMEDIATE·쓰기 잠금 선점은 다른 요청을 막거나 피해를 옮겨
 * 쓰지 않는다. Oracle·PostgreSQL({@link McmAuditStatementInspector#isSqlite()} = false)에서는 다시 시도하지 않는다.
 */
public final class SqliteBusyRetry {

    private static final Logger log = LoggerFactory.getLogger(SqliteBusyRetry.class);

    /** 처음 시도 뒤 다시 시도하는 횟수. 동시 로그인은 한 판에 한 건만 이기므로 3회면 4건 겹침까지 버틴다. */
    static final int RETRIES = 3;

    private SqliteBusyRetry() {}

    public static <T> T call(Supplier<T> work) {
        for (int attempt = 0; ; attempt++) {
            try {
                return work.get();
            } catch (RuntimeException e) {
                if (attempt >= RETRIES || !McmAuditStatementInspector.isSqlite() || !isBusy(e)) throw e;
                log.info("[SqliteBusyRetry] SQLITE_BUSY — 다시 시도 {}/{}", attempt + 1, RETRIES);
                // 지수 대기 + 흔들림 — 겹친 로그인들이 같은 박자로 다시 부딪히지 않게.
                long waitMs = (50L << attempt) + ThreadLocalRandom.current().nextLong(50);
                try {
                    Thread.sleep(waitMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    static boolean isBusy(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof SQLiteException se && (se.getResultCode().code & 0xFF) == SQLiteErrorCode.SQLITE_BUSY.code) {
                return true;
            }
            if (t.getCause() == t) break;
        }
        return false;
    }
}
