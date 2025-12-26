# REST API & gRPC Best Practices

## REST API Design Best Practices

### 1. Resource-Oriented Design

**Core Principle**: Design APIs around resources, not actions

**Good** (Resource-oriented):
```
GET    /api/users                    # List users
POST   /api/users                    # Create user
GET    /api/users/123                # Get user 123
PUT    /api/users/123                # Update user 123
DELETE /api/users/123                # Delete user 123
GET    /api/users/123/posts          # Get user's posts
```

**Bad** (Action-oriented):
```
GET    /api/getUsers
POST   /api/createUser
GET    /api/getUserById?id=123
POST   /api/updateUser
POST   /api/deleteUser
GET    /api/getUserPosts?id=123
```

**Why Resource-Oriented:**
- Standard HTTP methods map to CRUD
- Predictable patterns (developers learn once, apply everywhere)
- Caching works naturally (GET is cacheable)
- Easier versioning and evolution

---

### 2. HTTP Methods Semantics

| Method | Purpose | Idempotent | Safe | Use Case |
|--------|---------|-----------|------|----------|
| **GET** | Retrieve resource | Yes | Yes | Read data, no side effects |
| **POST** | Create new resource | No | No | Create entity, non-idempotent |
| **PUT** | Replace entire resource | Yes | No | Full update (all fields) |
| **PATCH** | Partial resource update | No | No | Partial update (some fields) |
| **DELETE** | Remove resource | Yes | No | Delete entity |
| **HEAD** | Like GET but no body | Yes | Yes | Check if resource exists |
| **OPTIONS** | Describe communication options | Yes | Yes | CORS preflight, API introspection |

**Idempotent**: Calling multiple times = same result as once
- `PUT /users/123` (replace) is idempotent; safe to retry
- `POST /users` (create) is NOT idempotent; each call creates new user

**Safe**: No side effects or state change
- `GET /users` is safe
- `POST /users` is not safe

**Examples**:
```
# CORRECT: PUT for full replacement
PUT /api/users/123
{
  "name": "John",
  "email": "john@example.com",
  "phone": "555-1234"
  // All fields required; replaces entire user
}

# CORRECT: PATCH for partial update
PATCH /api/users/123
{
  "email": "newemail@example.com"
  // Only email field; others unchanged
}

# WRONG:
PUT /api/users/123/updateEmail
// Don't use action verbs with PUT
```

---

### HTTP Status Codes

**2xx Success Codes:**

| Code | Name | When to Use |
|------|------|-------------|
| **200** | OK | Request succeeded, return data in body |
| **201** | Created | Resource successfully created |
| **202** | Accepted | Request accepted for async processing |
| **204** | No Content | Request succeeded, no response body (DELETE, empty updates) |
| **206** | Partial Content | Returning partial data (pagination, range requests) |

**3xx Redirection Codes:**

| Code | Name | When to Use |
|------|------|-------------|
| **301** | Moved Permanently | Resource moved to new URL (permanent redirect) |
| **302** | Found | Temporary redirect |
| **304** | Not Modified | Conditional GET returned no new data (ETag match) |
| **307** | Temporary Redirect | Like 302 but preserves HTTP method |
| **308** | Permanent Redirect | Like 301 but preserves HTTP method |

**4xx Client Error Codes:**

| Code | Name | When to Use | Example |
|------|------|-------------|---------|
| **400** | Bad Request | Request syntax invalid, missing required fields | `{ "errors": "email is required" }` |
| **401** | Unauthorized | Authentication required or failed | `{ "error": "Invalid API key" }` |
| **403** | Forbidden | Authenticated but not authorized for resource | `{ "error": "You don't have permission to edit this post" }` |
| **404** | Not Found | Resource doesn't exist | `{ "error": "User 999 not found" }` |
| **405** | Method Not Allowed | HTTP method not supported for endpoint | `GET /api/users (POST only)` |
| **409** | Conflict | Request conflicts with current state (duplicate, version mismatch) | `{ "error": "Email already registered" }` |
| **410** | Gone | Resource permanently deleted | Old API endpoint |
| **422** | Unprocessable Entity | Request syntax valid but semantic error | `{ "error": "Invalid email format" }` |
| **429** | Too Many Requests | Rate limit exceeded | `Retry-After: 60` |

**5xx Server Error Codes:**

| Code | Name | When to Use |
|------|------|-------------|
| **500** | Internal Server Error | Unexpected server error (bug, crash) |
| **501** | Not Implemented | Feature not yet implemented |
| **502** | Bad Gateway | Gateway/upstream service error |
| **503** | Service Unavailable | Server overloaded or maintenance |
| **504** | Gateway Timeout | Upstream service timeout |

**Status Code Usage Examples:**

```python
from fastapi import FastAPI, HTTPException, status

app = FastAPI()

@app.post("/api/users", status_code=201)
async def create_user(data: UserCreate):
    # Check duplicate
    if db.user_exists(data.email):
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )
    
    user = db.create_user(data)
    return user

@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(
            status_code=404,
            detail=f"User {user_id} not found"
        )
    return user

@app.put("/api/users/{user_id}")
async def update_user(user_id: int, data: UserUpdate):
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404)
    
    # Full update
    updated = db.update_user(user_id, data)
    return updated

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    user = db.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404)
    
    db.delete_user(user_id)
    return Response(status_code=204)  # No content

@app.get("/api/data")
async def get_data_with_range(request: Request):
    if_none_match = request.headers.get("If-None-Match")
    
    data = get_latest_data()
    etag = f'"{hash(data)}"'
    
    # Client has latest version
    if if_none_match == etag:
        return Response(status_code=304)  # Not modified
    
    response = JSONResponse(data)
    response.headers["ETag"] = etag
    return response

@app.get("/api/legacy-endpoint")
async def legacy():
    # Endpoint moved
    return Response(
        status_code=301,
        headers={"Location": "/api/v2/new-endpoint"}
    )
```

---

### 3. Versioning Strategies

**Option 1: URL Path (Most Common)**
```
GET /api/v1/users
GET /api/v2/users

Pros: Clear, easy to route
Cons: URL proliferation, multiple implementations
```

**Option 2: Query Parameter**
```
GET /api/users?version=2

Pros: Single URL endpoint
Cons: Less clear, harder to cache
```

**Option 3: Header**
```
GET /api/users
Accept: application/vnd.api+json;version=2

Pros: Elegant, no URL pollution
Cons: Complex, clients might not support
```

**Option 4: Content Negotiation**
```
GET /api/users
Accept: application/json;version=2

Pros: Standard HTTP
Cons: Confusing for non-technical users
```

**Recommendation**: **Use URL path versioning** (v1, v2, v3)
- Clear and explicit
- Most developers expect it
- Easy to route differently
- Simple to deprecate old versions

---

### 4. Request/Response Structure

**Standard Request Format**:
```json
{
  "data": {
    "type": "users",
    "attributes": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "relationships": {
      "company": {
        "data": { "type": "companies", "id": "456" }
      }
    }
  }
}
```

**Standard Response Format (JSON:API)**:
```json
{
  "data": [
    {
      "type": "users",
      "id": "123",
      "attributes": {
        "name": "John Doe",
        "email": "john@example.com",
        "createdAt": "2024-01-15T10:30:00Z"
      },
      "relationships": {
        "company": {
          "data": { "type": "companies", "id": "456" }
        },
        "posts": {
          "data": [
            { "type": "posts", "id": "789" }
          ]
        }
      }
    }
  ],
  "included": [
    {
      "type": "companies",
      "id": "456",
      "attributes": { "name": "Acme Corp" }
    }
  ],
  "meta": {
    "totalCount": 150,
    "pageSize": 20,
    "page": 1
  },
  "links": {
    "self": "/api/v1/users?page=1&limit=20",
    "next": "/api/v1/users?page=2&limit=20",
    "last": "/api/v1/users?page=8&limit=20"
  }
}
```

**Error Response Format**:
```json
{
  "errors": [
    {
      "status": 400,
      "code": "INVALID_EMAIL",
      "title": "Invalid Email Format",
      "detail": "The email 'notanemail' is not a valid email address",
      "source": {
        "pointer": "/data/attributes/email"
      }
    }
  ]
}
```

**Alternative Error Response (simpler)**:
```json
{
  "error": "invalid_request",
  "error_description": "The email 'notanemail' is not a valid email address",
  "error_uri": "https://api.example.com/docs/errors#invalid_email"
}
```

**Validation Error Response (multiple fields)**:
```json
{
  "errors": {
    "email": "Invalid email format",
    "phone": "Phone number must be 10 digits",
    "age": "Age must be between 18 and 120"
  }
}
```

---

## Pagination Strategies

### 1. Offset-Based Pagination (Most Common)

**How it works**: Skip N records, take M records

```
GET /api/users?offset=0&limit=20   # First 20
GET /api/users?offset=20&limit=20  # Next 20 (skip 20, take 20)
GET /api/users?offset=40&limit=20  # Next 20 (skip 40, take 20)
```

**Pros:**
- Simple to implement
- Users can jump to any page
- Works with any database

**Cons:**
- **Offset problem**: Large offsets are slow
  ```sql
  SELECT * FROM users OFFSET 1000000 LIMIT 20
  -- Database must scan 1M records to skip them
  ```
- Data consistency issues (records can be inserted between requests)
- Less efficient with large datasets

**Implementation**:
```python
@app.get("/api/users")
def list_users(offset: int = 0, limit: int = 20):
    # Validate
    if offset < 0 or limit > 100:
        return error("Invalid pagination")
    
    users = db.query(User).offset(offset).limit(limit).all()
    total = db.query(User).count()
    
    return {
        "data": users,
        "pagination": {
            "offset": offset,
            "limit": limit,
            "total": total,
            "pages": (total + limit - 1) // limit
        }
    }
```

---

### 2. Cursor-Based Pagination (Recommended for Large Datasets)

**How it works**: Use a pointer (cursor) to mark position

```
GET /api/users?cursor=abc123&limit=20    # Get 20 after cursor
GET /api/users?cursor=next_cursor&limit=20
```

**Cursor is typically**: Base64 encoded string like `eyJpZCI6IDEwMDB9`

**Pros:**
- Efficient for large datasets
- Immune to data insertion/deletion between requests
- Works well with streaming
- Cursor can encode sorting criteria

**Cons:**
- Cannot jump to arbitrary page
- Cannot go backwards (or complex to implement)
- Requires encoded cursor format
- Not for simple use cases

**Implementation**:
```python
@app.get("/api/users")
def list_users(cursor: Optional[str] = None, limit: int = 20):
    if cursor:
        # Decode cursor: eyJpZCI6IDEwMDB9 -> {"id": 1000}
        cursor_data = json.loads(base64.b64decode(cursor))
        last_id = cursor_data['id']
        # Get records AFTER this ID
        query = db.query(User).filter(User.id > last_id)
    else:
        query = db.query(User)
    
    # Get limit + 1 to check if more data exists
    users = query.order_by(User.id).limit(limit + 1).all()
    
    has_more = len(users) > limit
    users = users[:limit]
    
    # Generate next cursor
    if users and has_more:
        next_cursor = base64.b64encode(
            json.dumps({"id": users[-1].id}).encode()
        ).decode()
    else:
        next_cursor = None
    
    return {
        "data": users,
        "pagination": {
            "cursor": next_cursor,
            "hasMore": has_more
        }
    }
```

---

### 3. Page-Based Pagination (User-Friendly)

**How it works**: Page number (1, 2, 3...) with page size

```
GET /api/users?page=1&pageSize=20   # First page
GET /api/users?page=2&pageSize=20   # Second page
```

**Pros:**
- Intuitive for users (page 1, page 2, page 3)
- Works with UI components (pagination buttons)
- Similar to offset (often implemented using offset)

**Cons:**
- Same issues as offset for large pages
- "Go to page 1000000" is inefficient
- Data consistency issues

**Implementation**:
```python
@app.get("/api/users")
def list_users(page: int = 1, pageSize: int = 20):
    offset = (page - 1) * pageSize
    users = db.query(User).offset(offset).limit(pageSize).all()
    total = db.query(User).count()
    
    return {
        "data": users,
        "pagination": {
            "page": page,
            "pageSize": pageSize,
            "totalCount": total,
            "totalPages": (total + pageSize - 1) // pageSize
        }
    }
```

---

### 4. Seek-Based Pagination (High-Performance)

**How it works**: Use WHERE clause to find next batch of records

```
GET /api/users?seekId=1000&limit=20
-- Gets records where id > 1000, limit 20
```

**Pros:**
- Extremely fast for large datasets
- Works naturally with indexes
- No offset scanning needed

**Cons:**
- Requires sortable unique column
- Cannot skip backward
- Requires reverse cursor for backward pagination

**Implementation**:
```python
@app.get("/api/users")
def list_users(seekId: Optional[int] = None, limit: int = 20):
    if seekId:
        query = db.query(User).filter(User.id > seekId)
    else:
        query = db.query(User)
    
    users = query.order_by(User.id).limit(limit + 1).all()
    
    has_more = len(users) > limit
    users = users[:limit]
    
    next_seek_id = users[-1].id if users else None
    
    return {
        "data": users,
        "pagination": {
            "nextSeekId": next_seek_id,
            "hasMore": has_more
        }
    }
```

---

### Pagination Comparison

| Strategy | Speed | User Experience | Use Case |
|----------|-------|-----------------|----------|
| **Offset** | Slow for large offsets | Good (page numbers) | Small datasets, admin UIs |
| **Cursor** | Fast, consistent | Medium (no direct jump) | Large datasets, mobile apps |
| **Page** | Slow for high pages | Excellent (obvious) | CRUD apps, user-facing UIs |
| **Seek** | Very fast | Poor (no direct access) | Real-time feeds, logs, streams |

**Recommendation**:
- **< 10K records**: Use offset (simplicity)
- **10K - 1M records**: Use page with caching
- **> 1M records**: Use cursor or seek
- **Streams/feeds**: Use cursor or seek only

---

## REST API Optimization Techniques

### 1. Filtering & Querying

**Good filtering**:
```
GET /api/users?status=active&role=admin&createdAfter=2024-01-01
GET /api/posts?authorId=123&tags=javascript,rust&minLikes=100
```

**Implementation**:
```python
@app.get("/api/users")
def list_users(
    status: Optional[str] = None,
    role: Optional[str] = None,
    createdAfter: Optional[datetime] = None
):
    query = db.query(User)
    
    if status:
        query = query.filter(User.status == status)
    if role:
        query = query.filter(User.role == role)
    if createdAfter:
        query = query.filter(User.created_at > createdAfter)
    
    return query.all()
```

---

### 2. Sorting

**Query parameters for sorting**:
```
GET /api/users?sort=createdAt:desc,name:asc
GET /api/posts?sort=-createdAt,+title        # - for desc, + for asc
```

**Implementation**:
```python
@app.get("/api/users")
def list_users(sort: Optional[str] = None):
    query = db.query(User)
    
    if sort:
        for field_spec in sort.split(','):
            if field_spec.startswith('-'):
                field_name = field_spec[1:]
                query = query.order_by(
                    getattr(User, field_name).desc()
                )
            else:
                field_name = field_spec.lstrip('+')
                query = query.order_by(
                    getattr(User, field_name)
                )
    
    return query.all()
```

---

### 3. Field Selection (Sparse Fieldsets)

**Allow clients to request only needed fields**:
```
GET /api/users?fields=id,name,email
// Returns only these fields, reduces payload
```

**Implementation**:
```python
@app.get("/api/users")
def list_users(fields: Optional[str] = None):
    query = db.query(User)
    users = query.all()
    
    if fields:
        allowed_fields = fields.split(',')
        return [
            {f: getattr(u, f) for f in allowed_fields if hasattr(u, f)}
            for u in users
        ]
    return users
```

---

### 4. Caching Headers

**Implement HTTP caching properly**:
```python
@app.get("/api/users/{user_id}")
def get_user(user_id: int):
    user = db.query(User).filter(User.id == user_id).first()
    
    response = Response(json.dumps(user))
    
    # Cache for 5 minutes
    response.headers["Cache-Control"] = "public, max-age=300"
    
    # ETag for conditional requests
    response.headers["ETag"] = f'"{hash(user)}"'
    
    return response

# Client respects these headers
# GET /api/users/123
# Response includes: Cache-Control, ETag
# 
# GET /api/users/123 (within 5 minutes)
# Browser uses cached version (304 Not Modified)
#
# After 5 minutes:
# GET /api/users/123
# If-None-Match: "hash123"
# Server returns 304 (not changed) or 200 with new data
```

---

### 5. Compression

**Enable gzip compression**:
```python
from fastapi.middleware.gzip import GZIPMiddleware

app.add_middleware(GZIPMiddleware, minimum_size=1000)
# Responses > 1KB are gzip compressed automatically
```

**Bandwidth reduction**:
```
Before: 100KB JSON response
After:  10KB gzipped (90% reduction)
```

---

### 6. Rate Limiting

**Prevent abuse**:
```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

@app.get("/api/users")
@limiter.limit("100/minute")
def list_users(request: Request):
    return db.query(User).all()
```

---

### 7. Async/Non-blocking

**Use async for I/O-heavy operations**:
```python
@app.get("/api/users")
async def list_users():
    users = await db.query(User).all()  # Non-blocking
    return users
```

---

## gRPC Best Practices

### 1. Proto Definition Design

**Good proto definition**:
```protobuf
syntax = "proto3";

package user.v1;

option go_package = "github.com/company/user/v1";

service UserService {
  rpc GetUser(GetUserRequest) returns (User);
  rpc ListUsers(ListUsersRequest) returns (ListUsersResponse);
  rpc CreateUser(CreateUserRequest) returns (User);
  rpc UpdateUser(UpdateUserRequest) returns (User);
  rpc DeleteUser(DeleteUserRequest) returns (google.protobuf.Empty);
  rpc StreamUsers(Empty) returns (stream User);
}

message GetUserRequest {
  int64 user_id = 1;
}

message ListUsersRequest {
  int32 page_size = 1;
  string page_token = 2;
  string filter = 3;
}

message ListUsersResponse {
  repeated User users = 1;
  string next_page_token = 2;
  int32 total_count = 3;
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
}

message User {
  int64 id = 1;
  string name = 2;
  string email = 3;
  string status = 4;
  int64 created_at = 5;  // Unix timestamp
}

message UpdateUserRequest {
  int64 id = 1;
  google.protobuf.StringValue name = 2;  // Optional field
  google.protobuf.StringValue email = 3;
}

message DeleteUserRequest {
  int64 user_id = 1;
}

message Empty {}
```

**Key points:**
- Start field numbering at 1
- Never reuse field numbers
- Use google.protobuf types for optional fields
- Use repeated for arrays
- Always version your API (v1, v2 in package)

---

### 2. Streaming Strategies

**Server Streaming** (one request, many responses):
```protobuf
rpc StreamUsers(Empty) returns (stream User);
```

**Client Streaming** (many requests, one response):
```protobuf
rpc UploadProfilePics(stream ImageChunk) returns (UploadResponse);
```

**Bi-directional Streaming** (concurrent requests/responses):
```protobuf
rpc Chat(stream Message) returns (stream Message);
```

---

### 3. Error Handling

**Use gRPC error codes**:
```python
from grpc import StatusCode

def get_user(request):
    user = db.get_user(request.user_id)
    if not user:
        raise RpcError(
            code=StatusCode.NOT_FOUND,
            details=f"User {request.user_id} not found"
        )
    return user

def create_user(request):
    if not is_valid_email(request.email):
        raise RpcError(
            code=StatusCode.INVALID_ARGUMENT,
            details="Email format invalid"
        )
    return db.create(User(**request))
```

**gRPC Status Codes:**
- `OK`: Success
- `CANCELLED`: Operation cancelled
- `UNKNOWN`: Unknown error
- `INVALID_ARGUMENT`: Bad input
- `DEADLINE_EXCEEDED`: Timeout
- `NOT_FOUND`: Resource not found
- `ALREADY_EXISTS`: Duplicate
- `PERMISSION_DENIED`: Unauthorized
- `RESOURCE_EXHAUSTED`: Quota exceeded
- `FAILED_PRECONDITION`: Wrong state
- `ABORTED`: Concurrent conflict
- `OUT_OF_RANGE`: Index out of range
- `UNIMPLEMENTED`: Not implemented
- `INTERNAL`: Internal error
- `UNAVAILABLE`: Service unavailable
- `DATA_LOSS`: Data lost

---

### 4. Interceptors (Middleware)

**Authentication interceptor**:
```python
class AuthInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        metadata = handler_call_details.invocation_metadata
        
        token = None
        for key, value in metadata:
            if key == 'authorization':
                token = value
        
        if not token or not validate_token(token):
            raise RpcError(
                code=StatusCode.UNAUTHENTICATED,
                details="Invalid token"
            )
        
        return continuation(handler_call_details)
```

---

### 5. Performance Optimization

**Connection pooling**:
```python
# Server supports multiplexing by default
# Multiple requests share one connection

# Client: Reuse channel
channel = grpc.aio.secure_channel(
    'user-service:50051',
    grpc.ssl_channel_credentials()
)
stub = UserServiceStub(channel)

# Make multiple calls on same channel
users = stub.ListUsers(ListUsersRequest())
user = stub.GetUser(GetUserRequest(user_id=123))
```

**Compression**:
```protobuf
// In proto file
service UserService {
  rpc GetUser(GetUserRequest) returns (User) {
    option (google.api.http) = {
      get: "/v1/users/{user_id}"
    };
  }
}
```

---

## Interview Questions & Answers

### Q1: How would you design REST API pagination for a feed of 100M events?

**Answer:**

**Requirements analysis:**
- 100M events (very large)
- Typical use case: Social feed, logs, notifications
- Users expect chronological ordering (newest first)

**Solution: Cursor-based pagination with seek**

```python
from datetime import datetime
from typing import Optional

@app.get("/api/feed")
async def get_feed(
    cursor: Optional[str] = None,
    limit: int = 20
):
    # Cursor is base64 encoded JSON: {"timestamp": 1704067200, "id": 12345}
    if cursor:
        cursor_data = json.loads(base64.b64decode(cursor))
        query = db.query(Event).filter(
            (Event.timestamp < cursor_data['timestamp']) |
            ((Event.timestamp == cursor_data['timestamp']) & 
             (Event.id < cursor_data['id']))
        )
    else:
        query = db.query(Event)
    
    # Get limit + 1 to check if more exists
    events = (
        query
        .order_by(Event.timestamp.desc(), Event.id.desc())
        .limit(limit + 1)
        .all()
    )
    
    has_more = len(events) > limit
    events = events[:limit]
    
    # Generate next cursor from last event
    if events and has_more:
        last_event = events[-1]
        next_cursor = base64.b64encode(
            json.dumps({
                "timestamp": int(last_event.timestamp.timestamp()),
                "id": last_event.id
            }).encode()
        ).decode()
    else:
        next_cursor = None
    
    return {
        "data": events,
        "pagination": {
            "cursor": next_cursor,
            "hasMore": has_more
        }
    }
```

**Why cursor?**
- No offset scanning (super fast)
- Handles insertion/deletion between requests
- Client can't accidentally skip data
- Works with high-frequency streams

**Why timestamp + id?**
- Timestamp for ordering
- ID for tie-breaking (duplicates at same timestamp)

---

### Q2: REST vs gRPC for microservices. What factors would you consider?

**Answer:**

**Decision matrix:**

| Factor | REST Better | gRPC Better |
|--------|------------|-----------|
| **Team familiarity** | Less experienced | Familiar with binary protocols |
| **Performance required** | 100ms acceptable | <10ms required |
| **Bandwidth constrained** | No | Yes (mobile, IoT) |
| **Browser clients** | Yes | No (needs proxy) |
| **Complex queries** | Yes (REST flexible) | No (fixed schema) |
| **Long-lived connections** | No | Yes |
| **Streaming data** | Complex | Native |
| **API evolution** | Easier (flexible) | Harder (breaking changes) |

**My recommendation: Hybrid approach**

```
API Gateway (REST) ← Clients (web, mobile, partners)
    ↓
Converts REST → gRPC
    ↓
Microservices (gRPC for internal)
  ├─ User Service
  ├─ Post Service
  ├─ Comment Service
  └─ Analytics Service
```

**Implementation example:**
```python
# API Gateway: REST endpoint
@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    # Convert to gRPC call
    response = await grpc_user_service.GetUser(
        GetUserRequest(user_id=user_id)
    )
    
    # Convert protobuf response to JSON for REST client
    return {
        "id": response.id,
        "name": response.name,
        "email": response.email
    }
```

**Benefits:**
- External clients use familiar REST
- Internal services use efficient gRPC
- Gateway handles protocol translation
- Best of both worlds

---

### Q3: Design a caching strategy for REST API with TTL. Consider stale data.

**Answer:**

**Requirements:**
- Some data changes frequently (user posts: minutes)
- Some rarely changes (user profile: hours)
- Cannot serve stale data beyond threshold

**Solution: Variable TTL with cache invalidation**

```python
from functools import wraps
from datetime import datetime, timedelta
import redis

cache = redis.Redis()

def cached_endpoint(ttl_seconds=300, key_prefix=""):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Generate cache key
            cache_key = f"{key_prefix}:{':'.join(map(str, args))}"
            
            # Try cache
            cached = cache.get(cache_key)
            if cached:
                return json.loads(cached)
            
            # Cache miss: call function
            result = await func(*args, **kwargs)
            
            # Store with TTL
            cache.setex(
                cache_key,
                ttl_seconds,
                json.dumps(result)
            )
            
            return result
        return wrapper
    return decorator

# Different TTL by data type
@app.get("/api/users/{user_id}")
@cached_endpoint(ttl_seconds=3600, key_prefix="user")  # 1 hour
async def get_user(user_id: int):
    return db.get_user(user_id)

@app.get("/api/users/{user_id}/posts")
@cached_endpoint(ttl_seconds=300, key_prefix="user_posts")  # 5 minutes
async def get_user_posts(user_id: int):
    return db.get_user_posts(user_id)

# Cache invalidation on updates
@app.put("/api/users/{user_id}")
async def update_user(user_id: int, data: UpdateUserRequest):
    user = db.update_user(user_id, data)
    
    # Invalidate cache
    cache.delete(f"user:{user_id}")
    cache.delete(f"user_posts:{user_id}")
    
    return user
```

**Advanced: Stale-while-revalidate**

```python
@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    cache_key = f"user:{user_id}"
    
    # Try cache
    cached = cache.get(cache_key)
    if cached:
        data = json.loads(cached)
        
        # Still valid
        if not is_stale(data):
            return data
        
        # Return stale data but revalidate in background
        asyncio.create_task(revalidate_user(user_id))
        return data
    
    # No cache: fetch and cache
    user = db.get_user(user_id)
    cache.setex(cache_key, 3600, json.dumps(user))
    return user

async def revalidate_user(user_id: int):
    """Background task to refresh cache"""
    user = db.get_user(user_id)
    cache.setex(f"user:{user_id}", 3600, json.dumps(user))
```

---

### Q4: How would you handle versioning for a REST API used by 1000+ external clients?

**Answer:**

**Challenge:** Cannot break 1000 clients at once

**Solution: Semantic versioning with deprecation window**

```python
from datetime import datetime

# Version 1: Original API
@app.get("/api/v1/users/{user_id}")
def get_user_v1(user_id: int):
    return db.get_user(user_id)

# Version 2: Added new field
@app.get("/api/v2/users/{user_id}")
def get_user_v2(user_id: int):
    user = db.get_user(user_id)
    return {
        **user,
        "createdAt": user.created_at,  # New field
        "updatedAt": user.updated_at   # New field
    }

# Deprecation management
DEPRECATION_SCHEDULE = {
    "v1": {
        "deprecated_date": datetime(2024, 1, 1),
        "sunset_date": datetime(2025, 1, 1),  # Final deadline
        "message": "API v1 is deprecated. Please migrate to v2 by Jan 1, 2025"
    }
}

@app.middleware("http")
async def deprecation_headers(request, call_next):
    version = extract_api_version(request.url.path)
    
    if version in DEPRECATION_SCHEDULE:
        schedule = DEPRECATION_SCHEDULE[version]
        response = await call_next(request)
        
        response.headers["Deprecation"] = "true"
        response.headers["Sunset"] = schedule["sunset_date"].isoformat()
        response.headers["Warning"] = f'299 - "{schedule["message"]}"'
        
        return response
    
    return await call_next(request)
```

**Deprecation strategy:**
```
Month 1-6: v1 + v2, deprecation headers
Month 7-11: v1 (limited support) + v2 (default)
Month 12: v1 support ends, hard cutoff
```

---

### Q5: Design gRPC for a payment service handling 10K transactions/sec.

**Answer:**

**Requirements:**
- High throughput (10K/sec)
- Low latency (<100ms)
- Strict consistency (no data loss)
- High availability

**Solution: gRPC with streaming and circuit breaker**

```protobuf
syntax = "proto3";

package payment.v1;

service PaymentService {
  rpc ProcessPayment(PaymentRequest) returns (PaymentResponse);
  rpc StreamPayments(stream PaymentRequest) returns (stream PaymentResponse);
  rpc GetStatus(TransactionId) returns (PaymentStatus);
}

message PaymentRequest {
  string idempotency_key = 1;  // Prevents duplicates
  string user_id = 2;
  int64 amount_cents = 3;
  string currency = 4;
  string description = 5;
  map<string, string> metadata = 6;
}

message PaymentResponse {
  string transaction_id = 1;
  string status = 2;  // PENDING, SUCCESS, FAILED
  int64 timestamp = 3;
}

message PaymentStatus {
  string transaction_id = 1;
  string status = 2;
  int64 processed_at = 3;
}

message TransactionId {
  string id = 1;
}
```

**Implementation:**

```python
import grpc
from concurrent import futures

class PaymentServicer:
    def __init__(self):
        self.db = Database()
        self.queue = MessageQueue()  # Kafka for reliability
        self.cache = Cache()  # Redis for idempotency
    
    async def ProcessPayment(self, request, context):
        # Idempotency check
        cached = await self.cache.get(request.idempotency_key)
        if cached:
            return cached  # Return cached response
        
        # Validate
        if request.amount_cents <= 0:
            await context.abort(
                grpc.StatusCode.INVALID_ARGUMENT,
                "Amount must be positive"
            )
        
        try:
            # Enqueue for processing
            transaction_id = await self.queue.enqueue({
                "type": "payment",
                "user_id": request.user_id,
                "amount": request.amount_cents,
                "currency": request.currency,
                "idempotency_key": request.idempotency_key
            })
            
            response = PaymentResponse(
                transaction_id=transaction_id,
                status="PENDING",
                timestamp=int(time.time())
            )
            
            # Cache response for idempotency
            await self.cache.set(
                request.idempotency_key,
                response,
                ttl=3600  # 1 hour
            )
            
            return response
        
        except Exception as e:
            await context.abort(
                grpc.StatusCode.INTERNAL,
                f"Payment processing failed: {str(e)}"
            )
    
    async def StreamPayments(self, request_iterator, context):
        """Handle batch payments with streaming"""
        async for payment_request in request_iterator:
            response = await self.ProcessPayment(payment_request, context)
            yield response

# Server setup with connection pooling
async def serve():
    server = grpc.aio.server(
        futures.ThreadPoolExecutor(max_workers=100),
        options=[
            ('grpc.max_concurrent_streams', 500),
            ('grpc.max_receive_message_length', 10 * 1024 * 1024),
            ('grpc.max_send_message_length', 10 * 1024 * 1024),
        ]
    )
    
    PaymentServicer = payment_pb2_grpc.PaymentServiceServicer()
    payment_pb2_grpc.add_PaymentServiceServicer_to_server(
        PaymentServicer, server
    )
    
    server.add_secure_port('[::]:50051', server_credentials)
    
    await server.start()
    await server.wait_for_termination()
```

**Client implementation with circuit breaker:**

```python
class PaymentClient:
    def __init__(self):
        self.channel = grpc.aio.secure_channel(
            'payment-service:50051',
            grpc.ssl_channel_credentials()
        )
        self.stub = PaymentServiceStub(self.channel)
        self.circuit_breaker = CircuitBreaker(
            failure_threshold=5,
            timeout=60
        )
    
    async def process_payment(self, request):
        if self.circuit_breaker.is_open():
            raise ServiceUnavailableError("Payment service degraded")
        
        try:
            response = await self.stub.ProcessPayment(request)
            self.circuit_breaker.record_success()
            return response
        except grpc.RpcError as e:
            self.circuit_breaker.record_failure()
            raise
```

**Key optimizations:**
- Idempotency key prevents duplicate charges
- Message queue ensures reliability
- Streaming for batch processing
- Connection pooling and multiplexing
- Circuit breaker prevents cascade failures
- Async/await for concurrency
