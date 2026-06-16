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
    code: `flowchart TD
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
    code: `flowchart LR
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
    code: `sequenceDiagram
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
    code: `sequenceDiagram
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
    code: `erDiagram
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
    code: `erDiagram
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
    code: `stateDiagram-v2
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
    code: `stateDiagram-v2
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
    code: `classDiagram
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
    code: `classDiagram
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
    code: `gantt
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
    code: `gantt
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
