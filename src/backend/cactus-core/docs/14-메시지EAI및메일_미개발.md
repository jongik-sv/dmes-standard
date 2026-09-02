# 14. 메시지 EAI 및 메일 (미개발)

> 통합 원본: 명시적 원본 없음 (`new/09-implementation-roadmap.md` 의 향후 항목)
> 구현 상태: **미구현**. cactus-core 에 MessagePublisher, MailSender, MailQueue 등 관련 클래스 전무.

---

## 1. 설계 의도

- 모듈간/외부 시스템 비동기 메시지 통합 (EAI)
- 메일 발송 (이메일 알림, 비밀번호 초기화, 보고서 등)
- 메시지/메일 발송 이력 관리

---

## 2. 제안 명세

### 2.1 메시지 EAI
```
cactus-core/messaging/
├── MessagePublisher.java        # 추상 인터페이스
├── MessageSubscriber.java
├── CactusMessage.java           # 표준 메시지 envelope (id, type, payload, txId)
├── kafka/
│   ├── KafkaMessagePublisher.java
│   └── KafkaMessageSubscriber.java
├── rabbitmq/
│   └── ...
└── outbox/
    ├── MessageOutbox.java       # DB outbox 패턴
    └── OutboxRelay.java
```

### 2.2 메일
```
cactus-core/mail/
├── MailSender.java              # 인터페이스 (SmtpMailSender, AwsSesMailSender)
├── MailTemplate.java            # 템플릿 (Thymeleaf, Velocity)
├── MailQueue.java               # DB 큐 (MessageOutbox 패턴 재사용)
├── MailHistory.java             # 발송 이력 엔티티
└── MailService.java
```

### 2.3 사용 패턴
```java
// 메시지 발행
publisher.publish("WORK_ORDER_CREATED", new CactusMessage(orderId, payload));

// 메일 발송
mailService.send(MailTemplate.PASSWORD_RESET, recipient, params);
```

---

## 3. 미구현 사유

- 현 단계 모듈간 통신은 동기 HTTP 만 사용 (15번 미개발 ModuleClient 도 미구현)
- 메일 발송 요건 미발생 (비밀번호 초기화는 관리자 수동 처리)
- EAI 인프라 (Kafka 등) 미도입

---

## 4. 도입 시 고려사항

| 항목 | 설명 |
|---|---|
| 인프라 선택 | Kafka (대용량) vs RabbitMQ (라우팅 유연) vs DB outbox (단순) |
| 트랜잭션 보장 | DB outbox 패턴 권장 (트랜잭션 내 메시지 저장 + 별도 relay) |
| 멱등성 | 메시지 ID 기반 dedup 보장 |
| 메일 템플릿 | Thymeleaf 추천 (Spring 통합) |
| SMTP vs SES | 사내 SMTP 우선, 외부 발송 시 AWS SES |
| 발송 이력 | 메일 본문은 GDPR 등 보존정책 고려 |
| 재시도 | 실패 시 exponential backoff |

---

## 5. 임시 대안

- 동기 ModuleClient (15번) 도입으로 모듈간 통신 부분 해결
- 메일은 외부 알림 서비스 (Slack webhook 등) 로 임시 대체
- 운영 알림은 모니터링 인프라 (Grafana Alert 등) 활용

---

## 6. 관련 정리본

- 15 HTTP 클라이언트 / 모듈 간 통신 (동기 통신, 미개발)
- 90 갭분석 및 구현 로드맵
