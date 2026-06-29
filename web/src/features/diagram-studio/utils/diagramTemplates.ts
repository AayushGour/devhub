export type DiagramType = 'flowchart' | 'sequence' | 'er' | 'state' | 'class' | 'gantt'

export interface DiagramTemplate {
  id: string
  type: DiagramType
  label: string
  description: string
  code: string
}

export const DIAGRAM_TYPE_LABELS: Record<DiagramType, string> = {
  flowchart: 'Flowchart',
  sequence: 'Sequence',
  er: 'ER Diagram',
  state: 'State',
  class: 'Class',
  gantt: 'Gantt',
}

export const TEMPLATES: DiagramTemplate[] = [
  {
    id: 'flowchart-basic',
    type: 'flowchart',
    label: 'Basic Flow',
    description: 'Simple top-down process with branching',
    code: `
flowchart TD
    A([Start]) --> B[/Input/]
    B --> C{Valid?}
    C -->|Yes| D[Process]
    C -->|No| E[/Error/]
    D --> F([End])
    E --> B`,
  },
  {
    id: 'flowchart-cicd',
    type: 'flowchart',
    label: 'CI/CD Pipeline',
    description: 'Deployment pipeline with review gate',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#16a34a",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#15803d",
      "lineColor": "#22c55e",
      "secondaryColor": "#dcfce7",
      "tertiaryColor": "#f0fdf4",
      "background": "#f0fdf4"
    }
  }
}%%
flowchart LR
    A([Push]) --> B[Build]
    B --> C{Tests}
    C -->|Pass| D[Stage]
    C -->|Fail| E[Notify]
    D --> F{Review}
    F -->|Approved| G[Deploy]
    F -->|Rejected| E
    E --> A`,
  },
  {
    id: 'sequence-api',
    type: 'sequence',
    label: 'API Request',
    description: 'REST API request-response flow',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#4f46e5",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#4338ca",
      "lineColor": "#6366f1",
      "secondaryColor": "#eef2ff",
      "actorBkg": "#eef2ff",
      "actorBorder": "#4f46e5",
      "actorTextColor": "#1e1b4b",
      "actorLineColor": "#6366f1",
      "signalColor": "#4f46e5",
      "signalTextColor": "#1e1b4b",
      "activationBkgColor": "#4f46e5",
      "activationBorderColor": "#4338ca",
      "noteBkgColor": "#eef2ff",
      "noteTextColor": "#312e81"
    }
  }
}%%
sequenceDiagram
    actor User
    participant Client
    participant API
    participant DB

    User->>Client: Action
    Client->>API: POST /resource
    API->>DB: Query
    DB-->>API: Result
    API-->>Client: 200 OK
    Client-->>User: Update UI`,
  },
  {
    id: 'sequence-auth',
    type: 'sequence',
    label: 'OAuth Flow',
    description: 'OAuth 2.0 authorization code flow',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#0d9488",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#0f766e",
      "lineColor": "#14b8a6",
      "secondaryColor": "#ccfbf1",
      "actorBkg": "#f0fdfa",
      "actorBorder": "#0d9488",
      "actorTextColor": "#134e4a",
      "actorLineColor": "#14b8a6",
      "signalColor": "#0d9488",
      "signalTextColor": "#134e4a",
      "activationBkgColor": "#0d9488",
      "activationBorderColor": "#0f766e",
      "noteBkgColor": "#ccfbf1",
      "noteTextColor": "#134e4a"
    }
  }
}%%
sequenceDiagram
    actor User
    participant App
    participant AuthServer
    participant API

    User->>App: Login
    App->>AuthServer: Redirect + code_challenge
    AuthServer-->>User: Login page
    User->>AuthServer: Credentials
    AuthServer-->>App: Auth code
    App->>AuthServer: Token request
    AuthServer-->>App: access_token
    App->>API: Request + Bearer token
    API-->>App: Protected resource`,
  },
  {
    id: 'er-blog',
    type: 'er',
    label: 'Blog Schema',
    description: 'Posts, users, comments, and tags',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#e11d48",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#be123c",
      "lineColor": "#f43f5e",
      "secondaryColor": "#ffe4e6",
      "tertiaryColor": "#fff1f2",
      "background": "#fff1f2"
    }
  }
}%%
erDiagram
    USER {
        int id PK
        string email UK
        string name
        timestamp createdAt
    }
    POST {
        int id PK
        string title
        text content
        int authorId FK
        timestamp publishedAt
    }
    COMMENT {
        int id PK
        text body
        int postId FK
        int userId FK
    }
    TAG {
        int id PK
        string name UK
    }
    POST_TAG {
        int postId FK
        int tagId FK
    }

    USER ||--o{ POST : writes
    POST ||--o{ COMMENT : has
    USER ||--o{ COMMENT : writes
    POST ||--o{ POST_TAG : tagged
    TAG ||--o{ POST_TAG : applied`,
  },
  {
    id: 'er-ecommerce',
    type: 'er',
    label: 'E-Commerce',
    description: 'Customers, orders, and products',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#ea580c",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#c2410c",
      "lineColor": "#f97316",
      "secondaryColor": "#ffedd5",
      "tertiaryColor": "#fff7ed",
      "background": "#fff7ed"
    }
  }
}%%
erDiagram
    CUSTOMER {
        int id PK
        string email UK
        string name
    }
    ORDER {
        int id PK
        int customerId FK
        decimal total
        string status
        timestamp createdAt
    }
    ORDER_ITEM {
        int id PK
        int orderId FK
        int productId FK
        int quantity
        decimal price
    }
    PRODUCT {
        int id PK
        string name
        decimal price
        int stock
    }

    CUSTOMER ||--o{ ORDER : places
    ORDER ||--o{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : appears`,
  },
  {
    id: 'state-traffic',
    type: 'state',
    label: 'Traffic Light',
    description: 'Simple traffic light state machine',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#334155",
      "primaryTextColor": "#f8fafc",
      "primaryBorderColor": "#475569",
      "lineColor": "#94a3b8",
      "secondaryColor": "#1e293b",
      "tertiaryColor": "#0f172a",
      "background": "#1e293b"
    }
  }
}%%
stateDiagram-v2
    [*] --> Red
    Red --> Green : timer
    Green --> Yellow : timer
    Yellow --> Red : timer`,
  },
  {
    id: 'state-order',
    type: 'state',
    label: 'Order Lifecycle',
    description: 'E-commerce order state transitions',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#1d4ed8",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#1e40af",
      "lineColor": "#3b82f6",
      "secondaryColor": "#d5d5d5",
      "tertiaryColor": "#eff6ff",
      "background": "#eff6ff"
    }
  }
}%%
stateDiagram-v2
    [*] --> Pending
    Pending --> Confirmed : payment
    Pending --> Cancelled : timeout
    Confirmed --> Processing : warehouse
    Processing --> Shipped : dispatch
    Shipped --> Delivered : arrival
    Delivered --> [*]
    Cancelled --> [*]`,
  },
  {
    id: 'class-repository',
    type: 'class',
    label: 'Repository Pattern',
    description: 'Repository + service layer structure',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#475569",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#334155",
      "lineColor": "#94a3b8",
      "secondaryColor": "#f1f5f9",
      "tertiaryColor": "#f8fafc",
      "background": "#f8fafc"
    }
  }
}%%
classDiagram
    class IRepository~T~ {
        <<interface>>
        +findById(id) T
        +findAll() List~T~
        +save(entity) T
        +delete(id) void
    }
    class UserRepository {
        -db Database
        +findById(id) User
        +findAll() List~User~
        +findByEmail(email) User
        +save(entity) User
        +delete(id) void
    }
    class UserService {
        -repo IRepository~User~
        +getUser(id) User
        +createUser(dto) User
        +deleteUser(id) void
    }
    class User {
        +int id
        +string email
        +string name
    }

    IRepository~T~ <|.. UserRepository : implements
    UserService --> IRepository~User~ : uses
    UserRepository --> User : manages`,
  },
  {
    id: 'class-observer',
    type: 'class',
    label: 'Observer Pattern',
    description: 'Observer design pattern implementation',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#6366f1",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#4f46e5",
      "lineColor": "#818cf8",
      "secondaryColor": "#eef2ff",
      "tertiaryColor": "#f5f3ff",
      "background": "#f5f3ff"
    }
  }
}%%
classDiagram
    class Subject {
        <<interface>>
        +attach(observer) void
        +detach(observer) void
        +notify() void
    }
    class Observer {
        <<interface>>
        +update(event) void
    }
    class EventEmitter {
        -observers List~Observer~
        +attach(observer) void
        +detach(observer) void
        +notify() void
    }
    class Logger {
        +update(event) void
    }
    class Metrics {
        +update(event) void
    }

    Subject <|.. EventEmitter : implements
    Observer <|.. Logger : implements
    Observer <|.. Metrics : implements
    EventEmitter --> Observer : notifies`,
  },
  {
    id: 'gantt-sprint',
    type: 'gantt',
    label: 'Sprint Plan',
    description: '2-week development sprint breakdown',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#0284c7",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#0369a1",
      "lineColor": "#38bdf8",
      "secondaryColor": "#e0f2fe",
      "tertiaryColor": "#f0f9ff",
      "background": "#f0f9ff",
      "sectionBkgColor": "#e0f2fe",
      "altSectionBkgColor": "#f0f9ff",
      "gridColor": "#bae6fd",
      "taskBkgColor": "#0284c7",
      "taskBorderColor": "#0369a1",
      "taskTextColor": "#ffffff",
      "activeTaskBkgColor": "#0ea5e9",
      "activeTaskBorderColor": "#0284c7",
      "doneTaskBkgColor": "#7dd3fc",
      "doneTaskBorderColor": "#38bdf8"
    }
  }
}%%
gantt
    title Sprint 24
    dateFormat YYYY-MM-DD
    section Design
        Wireframes        :done, d1, 2024-01-01, 2d
        Design review     :done, d2, after d1, 1d
    section Backend
        API design        :done, b1, 2024-01-01, 2d
        Implementation    :active, b2, after b1, 4d
        Unit tests        :b3, after b2, 2d
    section Frontend
        Components        :f1, after d2, 4d
        Integration       :f2, after b2, 3d
    section QA
        Testing           :q1, after f2, 2d
        Bug fixes         :q2, after q1, 1d`,
  },
  {
    id: 'gantt-roadmap',
    type: 'gantt',
    label: 'Product Roadmap',
    description: 'Quarterly product roadmap',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#0f766e",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#115e59",
      "lineColor": "#14b8a6",
      "secondaryColor": "#ccfbf1",
      "tertiaryColor": "#f0fdfa",
      "background": "#f0fdfa",
      "sectionBkgColor": "#ccfbf1",
      "altSectionBkgColor": "#f0fdfa",
      "gridColor": "#99f6e4",
      "taskBkgColor": "#0f766e",
      "taskBorderColor": "#115e59",
      "taskTextColor": "#ffffff",
      "activeTaskBkgColor": "#0d9488",
      "activeTaskBorderColor": "#0f766e",
      "doneTaskBkgColor": "#5eead4",
      "doneTaskBorderColor": "#2dd4bf"
    }
  }
}%%
gantt
    title Product Roadmap Q1
    dateFormat YYYY-MM-DD
    section Core
        Auth system       :done, 2024-01-01, 14d
        User management   :done, 2024-01-10, 10d
        Dashboard         :active, 2024-01-20, 14d
    section Features
        Notifications     :2024-02-01, 10d
        Analytics         :2024-02-10, 14d
        Export tools      :2024-02-20, 10d
    section Infrastructure
        CI/CD setup       :done, 2024-01-01, 5d
        Monitoring        :2024-02-01, 7d
        Performance       :2024-03-01, 14d`,
  },
  {
    id: 'flowchart-violet-pipeline',
    type: 'flowchart',
    label: 'Violet Deploy',
    description: 'Microservice image build, scan, and deploy with custom violet theme',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#7c3aed",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#5b21b6",
      "lineColor": "#8b5cf6",
      "secondaryColor": "#ede9fe",
      "tertiaryColor": "#f5f3ff",
      "background": "#faf5ff",
      "mainBkg": "#7c3aed",
      "nodeBorder": "#5b21b6",
      "clusterBkg": "#ede9fe",
      "titleColor": "#4c1d95",
      "edgeLabelBackground": "#ede9fe"
    }
  }
}%%
flowchart LR
    A([Commit]) --> B[Build Image]
    B --> C{Vuln Scan}
    C -->|Clean| D[Push Registry]
    C -->|Issues| E[Block & Alert]
    D --> F[Stage Deploy]
    F --> G{Smoke Tests}
    G -->|Pass| H[Prod Deploy]
    G -->|Fail| I[Rollback]
    I --> F`,
  },
  {
    id: 'sequence-dark-ocean',
    type: 'sequence',
    label: 'Dark WebSocket',
    description: 'Real-time WebSocket subscription flow with dark ocean theme',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#0ea5e9",
      "primaryTextColor": "#e2e8f0",
      "primaryBorderColor": "#0284c7",
      "lineColor": "#38bdf8",
      "secondaryColor": "#1e3a5f",
      "tertiaryColor": "#1e293b",
      "background": "#0f172a",
      "actorBkg": "#1e293b",
      "actorBorder": "#0ea5e9",
      "actorTextColor": "#e2e8f0",
      "actorLineColor": "#334155",
      "signalColor": "#38bdf8",
      "signalTextColor": "#e2e8f0",
      "activationBkgColor": "#0ea5e9",
      "activationBorderColor": "#0284c7",
      "noteBkgColor": "#1e3a5f",
      "noteTextColor": "#e2e8f0",
      "labelBoxBkgColor": "#1e293b",
      "labelTextColor": "#e2e8f0"
    }
  }
}%%
sequenceDiagram
    participant Browser
    participant Server
    participant Cache
    Browser->>Server: WS Upgrade
    Server-->>Browser: 101 Switching
    Browser->>Server: subscribe(channel)
    Server->>Cache: SUBSCRIBE channel
    Cache-->>Server: event fired
    Server-->>Browser: push(event)
    Browser->>Server: ack`,
  },
  {
    id: 'state-amber-payment',
    type: 'state',
    label: 'Amber Payment',
    description: 'Payment lifecycle state machine with warm amber theme',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#d97706",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#b45309",
      "lineColor": "#f59e0b",
      "secondaryColor": "#fef3c7",
      "tertiaryColor": "#fffbeb",
      "background": "#fffbeb",
      "mainBkg": "#d97706",
      "nodeBorder": "#b45309",
      "titleColor": "#78350f",
      "edgeLabelBackground": "#fef3c7"
    }
  }
}%%
stateDiagram-v2
    [*] --> Initiated
    Initiated --> Authorizing : submit
    Authorizing --> Authorized : bank_ok
    Authorizing --> Failed : bank_decline
    Authorized --> Capturing : capture
    Capturing --> Settled : success
    Capturing --> Failed : timeout
    Settled --> Refunded : refund_req
    Failed --> [*]
    Refunded --> [*]
    Settled --> [*]`,
  },
  {
    id: 'er-emerald-saas',
    type: 'er',
    label: 'Emerald SaaS',
    description: 'Multi-tenant SaaS database schema with emerald green theme',
    code: `%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryColor": "#059669",
      "primaryTextColor": "#ffffff",
      "primaryBorderColor": "#047857",
      "lineColor": "#10b981",
      "secondaryColor": "#d1fae5",
      "tertiaryColor": "#ecfdf5",
      "background": "#f0fdf4",
      "mainBkg": "#059669",
      "nodeBorder": "#047857",
      "titleColor": "#064e3b",
      "edgeLabelBackground": "#d1fae5"
    }
  }
}%%
erDiagram
    TENANT {
        int id PK
        string slug UK
        string plan
        timestamp createdAt
    }
    USER {
        int id PK
        int tenantId FK
        string email UK
        string role
    }
    WORKSPACE {
        int id PK
        int tenantId FK
        string name
    }
    RESOURCE {
        int id PK
        int workspaceId FK
        string type
        jsonb config
    }
    TENANT ||--o{ USER : has
    TENANT ||--o{ WORKSPACE : owns
    WORKSPACE ||--o{ RESOURCE : contains
    USER }o--o{ WORKSPACE : member`,
  },
]

export function detectDiagramType(code: string): DiagramType | null {
  const t = code.trimStart().toLowerCase()
  if (t.startsWith('flowchart') || t.startsWith('graph ')) return 'flowchart'
  if (t.startsWith('sequencediagram')) return 'sequence'
  if (t.startsWith('erdiagram')) return 'er'
  if (t.startsWith('statediagram')) return 'state'
  if (t.startsWith('classdiagram')) return 'class'
  if (t.startsWith('gantt')) return 'gantt'
  return null
}
