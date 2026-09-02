# KMC (Kafka Management Console) - React + Spring Boot 분리 계획서

## 1. 프로젝트 개요

### 1.1 목적
현재 DMES Framework 내 Nexacro 기반 Kafka 관리 화면들을 독립적인 React + Spring Boot 프로젝트로 분리하여 KMC(Kafka Management Console) 구축

### 1.2 범위
| 현재 화면 | 분리 후 기능 |
|-----------|-------------|
| KafkaStatusMgmt | 토픽 상태 관리 및 컨슈머 제어 |
| KafkaMessageMgmt | 메시지 조회 및 모니터링 |
| KafkaControlPopup | 오프셋 제어 (모달로 통합) |
| KafkaSeraiConfigMgmt | SERAI 연동 설정 관리 |

### 1.3 기대 효과
- 독립적인 KMC 시스템으로 운영 편의성 향상
- 모던 UI/UX 제공 (React 기반)
- REST API 기반으로 확장성 및 유지보수성 향상

---

## 2. 기술 스택

### 2.1 Backend
| 구분 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Framework | Spring Boot | 3.2.x | Java 17+ |
| Build Tool | Gradle | 8.x | Groovy DSL |
| ORM | MyBatis | 3.5.x | 기존 Mapper 재사용 |
| Database | Oracle | 19c | 기존 DB 연동 |
| Kafka Client | Spring Kafka | 3.1.x | 컨슈머 제어 |
| API Docs | SpringDoc OpenAPI | 2.x | Swagger UI |

### 2.2 Frontend
| 구분 | 기술 | 버전 | 비고 |
|------|------|------|------|
| Framework | React | 18.x | |
| Build Tool | Vite | 5.x | 빠른 빌드 |
| Language | JavaScript | ES6+ | |
| State Management | Zustand | 4.x | 경량 상태 관리 |
| UI Library | Ant Design | 5.x | 엔터프라이즈 UI |
| HTTP Client | Axios | 1.x | API 호출 |
| Table | AG Grid Community | 31.x | 고성능 그리드 |
| Routing | React Router | 6.x | SPA 라우팅 |

---

## 3. 프로젝트 구조

### 3.1 전체 구조
```
kmc/
├── backend/                          # Spring Boot 백엔드
│   ├── src/
│   │   ├── main/
│   │   │   ├── java/com/dongkuk/kmc/
│   │   │   └── resources/
│   │   └── test/
│   └── build.gradle
│
├── frontend/                         # React 프론트엔드
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
└── README.md
```

### 3.2 Backend 상세 구조
```
backend/src/main/java/com/dongkuk/kmc/
├── KmcApplication.java
│
├── config/
│   ├── WebConfig.java                # CORS 설정
│   ├── MyBatisConfig.java            # MyBatis 설정
│   └── KafkaConfig.java              # Kafka 설정
│
├── controller/
│   ├── TopicController.java          # 토픽 관리 API
│   ├── ConsumerController.java       # 컨슈머 제어 API
│   ├── MessageController.java        # 메시지 조회 API
│   ├── SeraiConfigController.java      # SERAI 설정 API
│   └── CommonController.java         # 공통 코드 API
│
├── service/
│   ├── TopicService.java
│   ├── ConsumerService.java
│   ├── MessageService.java
│   └── SeraiConfigService.java
│
├── mapper/
│   ├── TopicMapper.java
│   ├── SeraiConfigMapper.java
│   └── CommonMapper.java
│
├── dto/
│   ├── request/
│   │   ├── TopicSearchRequest.java
│   │   ├── TopicSaveRequest.java
│   │   ├── ConsumerControlRequest.java
│   │   ├── MessageSearchRequest.java
│   │   ├── OffsetSkipRequest.java
│   │   └── SeraiConfigSaveRequest.java
│   └── response/
│       ├── TopicResponse.java
│       ├── MessageResponse.java
│       ├── SeraiConfigResponse.java
│       └── ApiResponse.java
│
├── domain/
│   ├── KafkaTopic.java
│   ├── SeraiConfig.java
│   └── AppHost.java
│
├── kafka/
│   ├── KafkaOffsetService.java       # 오프셋 조회
│   ├── KafkaConsumerManager.java     # 컨슈머 제어
│   └── KafkaMessageBrowser.java      # 메시지 브라우징
│
└── exception/
    ├── GlobalExceptionHandler.java
    └── KmcException.java
```

### 3.3 Backend Resources 구조
```
backend/src/main/resources/
├── application.yml
├── application-dev.yml
├── application-prod.yml
└── mapper/
    ├── TopicMapper.xml
    ├── SeraiConfigMapper.xml
    └── CommonMapper.xml
```

### 3.4 Frontend 상세 구조
```
frontend/src/
├── App.jsx
├── main.jsx
│
├── components/
│   ├── common/
│   │   ├── Layout.jsx                # 전체 레이아웃
│   │   ├── Header.jsx                # 상단 헤더
│   │   ├── Sidebar.jsx               # 사이드 메뉴
│   │   ├── StatusBadge.jsx           # 상태 뱃지
│   │   └── ConfirmModal.jsx          # 확인 모달
│   │
│   └── kafka/
│       ├── TopicSearchForm.jsx       # 토픽 검색 폼
│       ├── TopicGrid.jsx             # 토픽 그리드
│       ├── ConsumerControlButtons.jsx # 컨슈머 제어 버튼
│       ├── OffsetControlModal.jsx    # 오프셋 제어 모달
│       ├── MessageSearchForm.jsx     # 메시지 검색 폼
│       ├── MessageGrid.jsx           # 메시지 그리드
│       ├── MessageDetailModal.jsx    # 메시지 상세 모달
│       ├── SeraiConfigSearchForm.jsx   # SERAI 검색 폼
│       └── SeraiConfigGrid.jsx         # SERAI 설정 그리드
│
├── pages/
│   ├── TopicManagement.jsx           # 토픽 관리 (KafkaStatusMgmt)
│   ├── MessageMonitor.jsx            # 메시지 모니터 (KafkaMessageMgmt)
│   └── SeraiConfig.jsx                 # SERAI 설정 (KafkaSeraiConfigMgmt)
│
├── services/
│   ├── api.js                        # Axios 인스턴스
│   ├── topicService.js               # 토픽 API
│   ├── consumerService.js            # 컨슈머 API
│   ├── messageService.js             # 메시지 API
│   └── seraiConfigService.js           # SERAI 설정 API
│
├── stores/
│   ├── useTopicStore.js              # 토픽 상태
│   ├── useMessageStore.js            # 메시지 상태
│   └── useSeraiConfigStore.js          # SERAI 설정 상태
│
├── hooks/
│   ├── useTopics.js
│   ├── useMessages.js
│   └── useSeraiConfig.js
│
├── utils/
│   ├── constants.js                  # 상수 정의
│   ├── formatter.js                  # 포맷터
│   └── validator.js                  # 유효성 검사
│
└── styles/
    └── index.css
```

---

## 4. Backend API 설계

### 4.1 API 엔드포인트 목록

#### 4.1.1 토픽 관리 (/api/topics)
| Method | Endpoint | 설명 | 원본 Task |
|--------|----------|------|-----------|
| GET | `/api/topics` | 토픽 목록 조회 | SearchKafkaConsumerStatus |
| GET | `/api/topics/{topicId}` | 단일 토픽 조회 | SetContainerStatus |
| POST | `/api/topics` | 토픽 등록 | SaveKafkaTopic |
| PUT | `/api/topics/{topicId}` | 토픽 수정 | SaveKafkaTopic |
| DELETE | `/api/topics/{topicId}` | 토픽 삭제 | SaveKafkaTopic |

#### 4.1.2 컨슈머 제어 (/api/consumers)
| Method | Endpoint | 설명 | 원본 Task |
|--------|----------|------|-----------|
| POST | `/api/consumers/{topicId}/pause` | 컨슈머 일시정지 | KafkaConsumerPause |
| POST | `/api/consumers/{topicId}/resume` | 컨슈머 재개 | KafkaConsumerResume |
| POST | `/api/consumers/{topicId}/stop` | 컨테이너 중지 | KafkaConsumerStop |
| POST | `/api/consumers/{topicId}/start` | 컨테이너 시작 | KafkaConsumerStart |
| POST | `/api/consumers/{topicId}/skip-offset` | 오프셋 스킵 | KafkaConsumerSkipOffset |
| POST | `/api/consumers/{topicId}/send-test` | 테스트 메시지 발송 | KafkaIFTest |

#### 4.1.3 메시지 조회 (/api/messages)
| Method | Endpoint | 설명 | 원본 Task |
|--------|----------|------|-----------|
| GET | `/api/messages` | 메시지 목록 조회 | SearchKafkaMessageList |
| GET | `/api/messages/{topicId}` | 토픽별 메시지 조회 | SearchMessage |

#### 4.1.4 SERAI 설정 (/api/serai-configs)
| Method | Endpoint | 설명 | 원본 Task |
|--------|----------|------|-----------|
| GET | `/api/serai-configs` | SERAI 설정 목록 조회 | CommonSelectTask |
| POST | `/api/serai-configs` | SERAI 설정 등록 | SaveSeraiConfig |
| PUT | `/api/serai-configs/{topicId}/{direction}` | SERAI 설정 수정 | SaveSeraiConfig |
| DELETE | `/api/serai-configs/{topicId}/{direction}` | SERAI 설정 삭제 | SaveSeraiConfig |

#### 4.1.5 공통 (/api/common)
| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/common/modules` | 모듈 코드 목록 |
| GET | `/api/common/biz-systems` | 비즈니스 시스템 목록 |

### 4.2 API 상세 명세

#### 4.2.1 토픽 목록 조회
```
GET /api/topics
```

**Request Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| topicId | String | N | 토픽 ID (LIKE 검색) |
| sendModuleId | String | N | 송신모듈 |
| recvModuleId | String | N | 수신모듈 |
| bizSystem | String | N | 컨슈머 모듈 |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "topicId": "TOPIC_001",
      "topicDesc": "주문 연동 토픽",
      "groupId": "TOPIC_001-service",
      "bizSystem": "MES",
      "sendModuleId": "ERP",
      "recvModuleId": "MES",
      "useYn": "Y",
      "containerStatus": "RUN",
      "currentOffset": 1500,
      "maxOffset": 1500
    }
  ],
  "message": null
}
```

#### 4.2.2 컨슈머 제어
```
POST /api/consumers/{topicId}/pause
POST /api/consumers/{topicId}/resume
POST /api/consumers/{topicId}/stop
POST /api/consumers/{topicId}/start
```

**Request Body:**
```json
{
  "groupId": "TOPIC_001-service",
  "bizSystem": "MES"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "topicId": "TOPIC_001",
    "previousStatus": "RUN",
    "currentStatus": "PAUSE"
  },
  "message": "컨슈머가 일시정지되었습니다."
}
```

#### 4.2.3 오프셋 스킵
```
POST /api/consumers/{topicId}/skip-offset
```

**Request Body:**
```json
{
  "groupId": "TOPIC_001-service",
  "bizSystem": "MES",
  "currentOffset": 1500,
  "targetOffset": 1505,
  "autoResume": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "topicId": "TOPIC_001",
    "previousOffset": 1500,
    "newOffset": 1505,
    "skippedCount": 5,
    "resumed": true
  },
  "message": "5건의 메시지가 스킵되었습니다."
}
```

#### 4.2.4 메시지 목록 조회
```
GET /api/messages
```

**Request Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| topicIds | String | N | 토픽 ID 목록 (콤마 구분) |
| sendModuleIds | String | N | 송신모듈 목록 (콤마 구분) |
| recvModuleIds | String | N | 수신모듈 목록 (콤마 구분) |
| dateFrom | String | Y | 조회 시작일시 (yyyy-MM-dd HH:mm:ss) |
| dateTo | String | Y | 조회 종료일시 (yyyy-MM-dd HH:mm:ss) |
| messageStatus | String | N | 메시지 상태 (콤마 구분) |
| includeValue | Boolean | N | 메시지 내용 포함 여부 (기본: false) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "topic": "TOPIC_001",
      "topicDesc": "주문 연동 토픽",
      "offset": 1500,
      "currentOffset": 1500,
      "maxOffset": 1502,
      "containerStatus": "RUN",
      "messageStatus": "PROCESSING",
      "transactionCode": "ORD001",
      "sendModuleId": "ERP",
      "recvModuleId": "MES",
      "timestamp": "2026-02-03T10:25:00",
      "value": "{\"orderId\": \"12345\"}"
    }
  ],
  "message": null
}
```

#### 4.2.5 SERAI 설정 목록 조회
```
GET /api/serai-configs
```

**Request Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| direction | String | N | 방향 (INBOUND/OUTBOUND) |
| topicId | String | N | 토픽 ID (LIKE 검색) |
| useYn | String | N | 사용여부 (Y/N) |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "topicId": "SERAI_TOPIC_001",
      "direction": "INBOUND",
      "integrationType": "DB",
      "pollingIntervalMs": 1000,
      "dbTableName": "TB_SERAI_DATA",
      "dbSchema": "SERAIUSER",
      "filePath": null,
      "backupPath": null,
      "ftpHost": null,
      "ftpPort": null,
      "ftpUser": null,
      "ftpPassword": null,
      "httpUrl": null,
      "httpMethod": null,
      "useYn": "Y"
    }
  ],
  "message": null
}
```

#### 4.2.6 SERAI 설정 등록/수정
```
POST /api/serai-configs
PUT /api/serai-configs/{topicId}/{direction}
```

**Request Body:**
```json
{
  "topicId": "SERAI_TOPIC_001",
  "direction": "INBOUND",
  "integrationType": "DB",
  "pollingIntervalMs": 1000,
  "dbTableName": "TB_SERAI_DATA",
  "dbSchema": "SERAIUSER",
  "useYn": "Y"
}
```

---

## 5. Frontend 설계

### 5.1 페이지 구성

#### 5.1.1 토픽 관리 (TopicManagement.jsx)
**기능:**
- 검색 조건: 토픽ID, 송신모듈, 수신모듈, 컨슈머모듈
- 토픽 그리드: 상태, 오프셋 정보 표시
- 행 추가/삭제/저장 기능
- 컨슈머 제어 버튼 (PAUSE/RESUME/STOP/START)
- 오프셋 제어 모달 호출
- 테스트 메시지 발송

**컴포넌트 구조:**
```
TopicManagement
├── TopicSearchForm
├── ActionButtons (조회/저장/행추가/행삭제)
├── TopicGrid
│   ├── StatusBadge (컨테이너 상태)
│   ├── ConsumerControlButtons
│   └── OffsetDisplay
└── OffsetControlModal
```

#### 5.1.2 메시지 모니터 (MessageMonitor.jsx)
**기능:**
- 검색 조건: 토픽ID(다중), 송신모듈(다중), 수신모듈(다중), 기간, 메시지상태(다중)
- 메시지 그리드: 상태별 색상 표시
- 메시지 상세 모달
- 오프셋 제어 연동 (ERROR 상태 메시지)

**컴포넌트 구조:**
```
MessageMonitor
├── MessageSearchForm
│   ├── MultiSelect (토픽)
│   ├── MultiSelect (송신모듈)
│   ├── MultiSelect (수신모듈)
│   ├── DateRangePicker
│   └── MultiSelect (메시지상태)
├── ActionButtons (조회/메시지제어)
├── MessageGrid
│   ├── StatusBadge (메시지 상태)
│   └── StatusBadge (컨테이너 상태)
├── MessageDetailModal
└── OffsetControlModal
```

#### 5.1.3 SERAI 설정 (SeraiConfig.jsx)
**기능:**
- 검색 조건: 방향, 토픽ID, 사용여부
- SERAI 설정 그리드
- 통합유형별 필드 동적 표시/숨김
- 유효성 검사 (통합유형별 필수 필드)
- 행 추가/삭제/저장 기능

**컴포넌트 구조:**
```
SeraiConfig
├── SeraiConfigSearchForm
├── ActionButtons (조회/저장/행추가/행삭제)
└── SeraiConfigGrid
    ├── IntegrationTypeSelect
    ├── DbFields (조건부)
    ├── FileFields (조건부)
    └── HttpFields (조건부)
```

### 5.2 공통 컴포넌트

#### 5.2.1 StatusBadge.jsx
```jsx
// 컨테이너 상태 색상
const containerStatusColors = {
  RUN: 'success',      // 녹색
  PAUSE: 'warning',    // 노란색
  STOP: 'error',       // 빨간색
  UNKNOWN: 'default'   // 회색
};

// 메시지 상태 색상
const messageStatusColors = {
  DONE: 'success',        // 녹색
  WAIT: 'warning',        // 노란색
  PROCESSING: 'processing', // 파란색
  ERROR: 'error',         // 빨간색
  UNKNOWN: 'default'      // 주황색
};
```

#### 5.2.2 ConsumerControlButtons.jsx
```jsx
// 버튼 활성화 조건
// PAUSE: containerStatus === 'RUN'
// RESUME: containerStatus === 'PAUSE'
// STOP: containerStatus !== 'STOP'
// START: containerStatus === 'STOP'
// 메시지제어: containerStatus === 'PAUSE' && currentOffset < maxOffset
```

### 5.3 상태 관리 (Zustand)

#### 5.3.1 useTopicStore.js
```javascript
import { create } from 'zustand';

const useTopicStore = create((set, get) => ({
  // State
  topics: [],
  loading: false,
  searchParams: {
    topicId: '',
    sendModuleId: '',
    recvModuleId: '',
    bizSystem: ''
  },
  selectedRows: [],

  // Actions
  setSearchParams: (params) => set((state) => ({
    searchParams: { ...state.searchParams, ...params }
  })),

  setTopics: (topics) => set({ topics }),

  setLoading: (loading) => set({ loading }),

  addRow: () => set((state) => ({
    topics: [...state.topics, {
      _rowStatus: 'C',
      topicId: '',
      topicDesc: '',
      groupId: '',
      bizSystem: '',
      sendModuleId: '',
      recvModuleId: '',
      useYn: 'Y'
    }]
  })),

  updateRow: (index, field, value) => set((state) => {
    const newTopics = [...state.topics];
    newTopics[index] = {
      ...newTopics[index],
      [field]: value,
      _rowStatus: newTopics[index]._rowStatus || 'U'
    };
    return { topics: newTopics };
  }),

  deleteRow: (index) => set((state) => {
    const newTopics = [...state.topics];
    if (newTopics[index]._rowStatus === 'C') {
      newTopics.splice(index, 1);
    } else {
      newTopics[index]._rowStatus = 'D';
    }
    return { topics: newTopics };
  }),

  updateTopicStatus: (topicId, status) => set((state) => ({
    topics: state.topics.map(t =>
      t.topicId === topicId ? { ...t, containerStatus: status } : t
    )
  }))
}));

export default useTopicStore;
```

#### 5.3.2 useMessageStore.js
```javascript
import { create } from 'zustand';

const useMessageStore = create((set) => ({
  // State
  messages: [],
  loading: false,
  searchParams: {
    topicIds: [],
    sendModuleIds: [],
    recvModuleIds: [],
    dateFrom: '',
    dateTo: '',
    messageStatus: [],
    includeValue: false
  },
  selectedMessage: null,

  // Actions
  setSearchParams: (params) => set((state) => ({
    searchParams: { ...state.searchParams, ...params }
  })),

  setMessages: (messages) => set({ messages }),

  setLoading: (loading) => set({ loading }),

  selectMessage: (message) => set({ selectedMessage: message }),

  clearSelection: () => set({ selectedMessage: null })
}));

export default useMessageStore;
```

### 5.4 API 서비스

#### 5.4.1 api.js
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request 인터셉터
api.interceptors.request.use(
  (config) => {
    // 로딩 표시 등
    return config;
  },
  (error) => Promise.reject(error)
);

// Response 인터셉터
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // 에러 처리
    const message = error.response?.data?.message || '오류가 발생했습니다.';
    return Promise.reject(new Error(message));
  }
);

export default api;
```

#### 5.4.2 topicService.js
```javascript
import api from './api';

export const topicService = {
  // 토픽 목록 조회
  getTopics: (params) => api.get('/topics', { params }),

  // 토픽 등록
  createTopic: (data) => api.post('/topics', data),

  // 토픽 수정
  updateTopic: (topicId, data) => api.put(`/topics/${topicId}`, data),

  // 토픽 삭제
  deleteTopic: (topicId) => api.delete(`/topics/${topicId}`)
};
```

#### 5.4.3 consumerService.js
```javascript
import api from './api';

export const consumerService = {
  // 컨슈머 일시정지
  pause: (topicId, data) => api.post(`/consumers/${topicId}/pause`, data),

  // 컨슈머 재개
  resume: (topicId, data) => api.post(`/consumers/${topicId}/resume`, data),

  // 컨테이너 중지
  stop: (topicId, data) => api.post(`/consumers/${topicId}/stop`, data),

  // 컨테이너 시작
  start: (topicId, data) => api.post(`/consumers/${topicId}/start`, data),

  // 오프셋 스킵
  skipOffset: (topicId, data) => api.post(`/consumers/${topicId}/skip-offset`, data),

  // 테스트 메시지 발송
  sendTest: (topicId, data) => api.post(`/consumers/${topicId}/send-test`, data)
};
```

---

## 6. 데이터베이스

### 6.1 사용 테이블 (기존)

| 테이블명 | 설명 |
|----------|------|
| TB_MCM_MOM_KAFKA_TOPICS | 토픽 마스터 |
| TB_MCM_MOM_KAFKA_SERAI_CONFIG | SERAI 설정 |
| TB_MCM_APPHOST | 애플리케이션 호스트 |

### 6.2 MyBatis Mapper 재사용

기존 Mapper XML을 그대로 활용하거나 필요시 수정:

| 원본 Mapper | 신규 Mapper |
|-------------|-------------|
| KafkaStatusMgmtMapper.xml | TopicMapper.xml |
| KafkaSeraiConfigMgmtMapper.xml | SeraiConfigMapper.xml |
| TB_MCM_MOM_KAFKA_TOPICS_Mapper.xml | (TopicMapper에 통합) |
| TB_MCM_MOM_KAFKA_SERAI_CONFIG_Mapper.xml | (SeraiConfigMapper에 통합) |

---

## 7. 마이그레이션 매핑

### 7.1 Backend Task → API 매핑

| 원본 Task | 원본 클래스 | 신규 API |
|-----------|-------------|----------|
| search | SearchKafkaConsumerStatus | GET /api/topics |
| save | SaveKafkaTopic | POST/PUT/DELETE /api/topics |
| setContainerStatus | SetContainerStatus | GET /api/topics/{id} |
| kafkaPause | KafkaConsumerPause | POST /api/consumers/{id}/pause |
| kafkaResume | KafkaConsumerResume | POST /api/consumers/{id}/resume |
| kafkaStop | KafkaConsumerStop | POST /api/consumers/{id}/stop |
| kafkaStart | KafkaConsumerStart | POST /api/consumers/{id}/start |
| kafkaSendTest | KafkaIFTest | POST /api/consumers/{id}/send-test |
| search | SearchKafkaMessageList | GET /api/messages |
| search | SearchMessage | GET /api/messages/{topicId} |
| skipOffset | KafkaConsumerSkipOffset | POST /api/consumers/{id}/skip-offset |
| search | CommonSelectTask (SERAI) | GET /api/serai-configs |
| save | SaveSeraiConfig | POST/PUT/DELETE /api/serai-configs |

### 7.2 Frontend 화면 → 페이지 매핑

| 원본 화면 | 원본 파일 | 신규 페이지 |
|-----------|-----------|-------------|
| KafkaStatusMgmt | KafkaStatusMgmt.xfdl | TopicManagement.jsx |
| KafkaMessageMgmt | KafkaMessageMgmt.xfdl | MessageMonitor.jsx |
| KafkaControlPopup | KafkaControlPopup.xfdl | OffsetControlModal.jsx |
| KafkaSeraiConfigMgmt | KafkaSeraiConfigMgmt.xfdl | SeraiConfig.jsx |

### 7.3 그리드 컬럼 매핑

#### 7.3.1 토픽 관리 그리드
| 원본 컬럼 | 신규 필드 | 타입 |
|-----------|-----------|------|
| STATUS | _rowStatus | 이미지 |
| TOPIC_ID | topicId | 텍스트 (PK) |
| TOPIC_DESC | topicDesc | 텍스트 |
| GROUP_ID | groupId | 텍스트 (자동생성) |
| BIZ_SYSTEM | bizSystem | 콤보 |
| SEND_MODULE_ID | sendModuleId | 콤보 |
| RECV_MODULE_ID | recvModuleId | 콤보 |
| USE_TP | useYn | 콤보 (Y/N) |
| CONTAINER_STATUS | containerStatus | 상태뱃지 |
| CURRENT_OFFSET | currentOffset | 숫자 |
| MAX_OFFSET | maxOffset | 숫자 |
| (버튼들) | - | 버튼 그룹 |

#### 7.3.2 메시지 그리드
| 원본 컬럼 | 신규 필드 | 타입 |
|-----------|-----------|------|
| RDO | selected | 라디오 |
| MESSAGE_STATUS | messageStatus | 상태뱃지 |
| TOPIC | topic | 텍스트 (링크) |
| TOPIC_DESC | topicDesc | 텍스트 |
| OFFSET | offset | 숫자 |
| CURRENT_OFFSET | currentOffset | 숫자 |
| MAX_OFFSET | maxOffset | 숫자 |
| CONTAINER_STATUS | containerStatus | 상태뱃지 |
| TRANSACTION_CODE | transactionCode | 텍스트 |
| SEND_MODULE_ID | sendModuleId | 텍스트 |
| RECV_MODULE_ID | recvModuleId | 텍스트 |
| TIMESTAMP | timestamp | 일시 |
| VALUE | value | 텍스트 (확장) |

#### 7.3.3 SERAI 설정 그리드
| 원본 컬럼 | 신규 필드 | 타입 |
|-----------|-----------|------|
| STATUS | _rowStatus | 이미지 |
| TOPIC_ID | topicId | 텍스트 (PK) |
| DIRECTION | direction | 콤보 (PK) |
| INTEGRATION_TYPE | integrationType | 콤보 |
| POLLING_INTERVAL_MS | pollingIntervalMs | 숫자 |
| DB_TABLE_NAME | dbTableName | 텍스트 |
| DB_SCHEMA | dbSchema | 텍스트 |
| FILE_PATH | filePath | 텍스트 |
| BACKUP_PATH | backupPath | 텍스트 |
| FTP_HOST | ftpHost | 텍스트 |
| FTP_PORT | ftpPort | 숫자 |
| FTP_USER | ftpUser | 텍스트 |
| FTP_PASSWORD | ftpPassword | 비밀번호 |
| HTTP_URL | httpUrl | 텍스트 |
| HTTP_METHOD | httpMethod | 콤보 |
| USE_YN | useYn | 콤보 |

---

## 8. 개발 단계

### Phase 1: 프로젝트 셋업
- [ ] Spring Boot 프로젝트 생성
- [ ] React 프로젝트 생성 (Vite)
- [ ] 기본 설정 (DB 연결, CORS 등)
- [ ] 공통 모듈 구현 (API Response, Exception Handler)

### Phase 2: Backend API 개발
- [ ] 토픽 관리 API (TopicController, TopicService)
- [ ] 컨슈머 제어 API (ConsumerController, ConsumerService)
- [ ] 메시지 조회 API (MessageController, MessageService)
- [ ] SERAI 설정 API (SeraiConfigController, SeraiConfigService)
- [ ] Kafka 연동 서비스 (KafkaOffsetService, KafkaConsumerManager)

### Phase 3: Frontend 개발
- [ ] 레이아웃 및 공통 컴포넌트
- [ ] 토픽 관리 페이지 (TopicManagement)
- [ ] 메시지 모니터 페이지 (MessageMonitor)
- [ ] SERAI 설정 페이지 (SeraiConfig)
- [ ] 오프셋 제어 모달 (OffsetControlModal)

### Phase 4: 테스트 및 검증
- [ ] API 단위 테스트
- [ ] 화면 기능 테스트
- [ ] 기존 화면 대비 기능 검증

---

## 9. 참고 자료

### 9.1 원본 파일 위치
| 구분 | 경로 |
|------|------|
| 화면 (xfdl) | src/nxuiFwk/cia/Kafka*.xfdl |
| BPMN | src/main/resources/services/cia/Kafka*.bpmn |
| Java Task | src/main/java/com/dongkuk/dmes/fwk/task/ui/cia/Kafka*/ |
| Mapper | src/main/resources/persistence/mappers-cia/Kafka*.xml |
| Table Mapper | src/main/resources/persistence/mappers-Table-MCMAPUSER/TB_MCM_MOM_KAFKA*.xml |

### 9.2 관련 문서
- KAFKA_UI_ANALYSIS.md: 현재 화면 상세 분석
- TASK_DEVELOPMENT_GUIDE.md: Java Task 개발 가이드
- NEXACRO_UI_GUIDE.md: Nexacro UI 가이드

---

*문서 작성일: 2026-02-03*
*작성자: AI Assistant*
