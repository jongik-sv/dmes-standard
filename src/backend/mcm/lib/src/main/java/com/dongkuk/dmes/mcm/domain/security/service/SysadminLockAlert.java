/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: SYSADMIN 계정이 비밀번호 실패로 잠기면 다른 SYSADMIN 에게 화면 알림(공지)을 올린다(D15)
 */
package com.dongkuk.dmes.mcm.domain.security.service;

import com.dongkuk.dmes.mcm.notice.common.NoticeCodes;
import com.dongkuk.dmes.mcm.notice.entity.Notice;
import com.dongkuk.dmes.mcm.notice.entity.NoticeTarget;
import com.dongkuk.dmes.mcm.notice.repository.NoticeRepository;
import com.dongkuk.dmes.mcm.notice.repository.NoticeTargetRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * SYSADMIN 잠금 알림 — SYSADMIN 역할 대상 긴급 공지를 오늘·내일 이틀 게시한다.
 *
 * <p>포털 실시간 알림(WebSocket)은 아직 없어 홈 공지 목록을 화면 알림으로 쓴다. 실패한 접속 IP 는 로그인 이력
 * ({@code TB_SEC_LOGIN_LOG}, LOGIN_FAIL)에 이미 남는다 — 공지 본문에는 마지막 IP 만 적는다.
 *
 * <p>로그인 트랜잭션과 떼어 쓴다(REQUIRES_NEW). 알림이 실패해도 잠금과 로그인 응답은 그대로다.
 */
@Component
public class SysadminLockAlert {

    private static final Logger log = LoggerFactory.getLogger(SysadminLockAlert.class);
    private static final DateTimeFormatter ID_DATE = DateTimeFormatter.ofPattern("yyyyMMdd", Locale.KOREA);
    static final String TARGET_ROLE = "SYSADMIN";

    private final NoticeRepository noticeRepository;
    private final NoticeTargetRepository noticeTargetRepository;

    public SysadminLockAlert(NoticeRepository noticeRepository, NoticeTargetRepository noticeTargetRepository) {
        this.noticeRepository = noticeRepository;
        this.noticeTargetRepository = noticeTargetRepository;
    }

    /**
     * @param userId  잠긴 계정
     * @param minutes 이번 잠금 시간(분)
     * @param clientIp 마지막 실패 접속 IP(모르면 null)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void locked(String userId, long minutes, String clientIp) {
        try {
            LocalDate today = LocalDate.now();
            Notice n = new Notice(nextNoticeId(today));
            n.setTitle("[보안] 시스템관리자 계정 잠김: " + userId);
            n.setContent("시스템관리자 계정 " + userId + " 이(가) 비밀번호를 여러 번 틀려 " + minutes + "분 동안 잠겼습니다."
                    + (clientIp == null ? "" : " 마지막 실패 접속 IP: " + clientIp + ".")
                    + " 본인이 아니면 로그인 이력을 확인하고 비밀번호를 바꾸게 하세요.");
            n.setContentFormat(NoticeCodes.FORMAT_TEXT);
            n.setNoticeCategory(NoticeCodes.CATEGORY_URGENT);
            n.setPinYn(NoticeCodes.NO);
            n.setTargetScope(NoticeCodes.SCOPE_ROLE);
            n.setNoticeStatus(NoticeCodes.STATUS_POSTED);
            n.setPostStartDt(today);
            n.setPostEndDt(today.plusDays(1));
            noticeRepository.save(n);
            noticeTargetRepository.save(new NoticeTarget(n.getNoticeId(), TARGET_ROLE));
        } catch (RuntimeException ex) {
            log.warn("[SysadminLockAlert] 잠금 알림을 올리지 못했다 — user={} : {}", userId, ex.getMessage());
        }
    }

    private String nextNoticeId(LocalDate today) {
        String prefix = "NT" + today.format(ID_DATE);
        String last = noticeRepository.findLastNoticeIdByPrefix(prefix);
        int seq = 1;
        if (last != null && last.length() == prefix.length() + 4) {
            try {
                seq = Integer.parseInt(last.substring(prefix.length())) + 1;
            } catch (NumberFormatException ignore) {
                seq = 1;
            }
        }
        return prefix + String.format("%04d", seq);
    }
}
