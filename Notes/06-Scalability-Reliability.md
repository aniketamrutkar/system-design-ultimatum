# Scalability and Reliability Patterns

## Vertical vs Horizontal Scaling

| Aspect | Vertical (Scale Up) | Horizontal (Scale Out) | When to Use |
|--------|-------------------|----------------------|-------------|
| **Approach** | Bigger server | More servers | Vertical: quick fix; Horizontal: long-term |
| **Limit** | Hardware limit | Virtually unlimited | Horizontal when vertical hits limits |
| **Cost** | Non-linear | Linear | Horizontal more cost-effective at scale |
| **Complexity** | Simple | Complex (distributed) | Vertical for simplicity |
| **Downtime** | Required | Zero (rolling) | Horizontal for high availability |

**Why Choose Vertical:**
- Quick wins, legacy apps, starting out

**Why Choose Horizontal:**
- High availability, predictable costs, massive scale

**Tradeoff Summary:**
- Vertical: Simple ↔ Limited, expensive
- Horizontal: Unlimited scale ↔ Complexity

---

## CAP Theorem Tradeoffs

| Choice | Guarantees | Sacrifice | Use Cases |
|--------|-----------|----------|-----------|
| **CP** | Consistency + Partition Tolerance | Availability | Banking, inventory, auctions |
| **AP** | Availability + Partition Tolerance | Consistency | Social feeds, analytics, caching |

**Why Choose CP:**
- Financial transactions, inventory management
- Data correctness > uptime

**Why Choose AP:**
- Social media, real-time analytics
- Uptime > immediate consistency

**Tradeoff Summary:**
- CP: Data correctness ↔ May be unavailable
- AP: Always available ↔ Stale data possible

---

## Load Balancing Strategies

| Strategy | How It Works | Pros | Cons | When to Use |
|----------|-------------|------|------|-------------|
| **Round Robin** | Distribute requests sequentially to each server | Simple, easy to implement | No awareness of server load | Uniform workloads, simple systems |
| **Least Connections** | Route to server with fewest active connections | Handles variable request durations | Overhead of tracking connections | Long-lived connections (WebSockets) |
| **IP Hash** | Route based on client IP (consistent) | Sticky sessions without affinity | Uneven distribution if IPs cluster | Session affinity (WebSockets, stateful apps) |
| **Weighted Round Robin** | Some servers get more traffic | Handles heterogeneous servers | Need to configure weights | Mix of powerful and weak servers |
| **Random** | Pick random server | Simple, low overhead | No optimization | Very simple loads |

---

## Replication Patterns

| Pattern | How It Works | Pros | Cons | When to Use |
|---------|-------------|------|------|-------------|
| **Master-Slave** | Single master writes, slaves read-only | Simple to understand | Single point of failure for writes | Read-heavy workloads |
| **Master-Master** | Multiple masters, bidirectional sync | No write SPOF | Conflict resolution complex | Multi-region setup |
| **Quorum-based** | Majority of replicas needed for consistency | Strong consistency + HA | Slower writes (wait for majority) | Critical data (banking) |

---

## Circuit Breaker Pattern

```
Normal state:
Request → Service A → Success ✓

Failure state (too many failures):
Request → Circuit Breaker (OPEN) → Fail fast ✗ (don't call failing service)

Recovery state (after timeout):
Request → Circuit Breaker (HALF-OPEN) → Try service A
         ↓
         Success → Close circuit (back to normal)
         Failure → Open circuit again
```

**Benefits:**
- Fail fast: Don't waste time on failing services
- Cascading failure prevention: Stop propagating failures
- Recovery: Automatically retry after timeout

---

## Interview Questions & Answers

### Q1: Your single MySQL server is maxed out. Scale vertically or horizontally?

**Answer:**
**First check**:
1. Is it CPU-bound or I/O bound?
   - `top` / `iostat` shows where bottleneck is
2. Can you optimize queries first?
   - Add indexes, denormalize, cache
   - Solves 80% of issues without scaling

**If optimization doesn't help:**

**Short-term (vertical scaling)**:
- Upgrade instance: m5.large → m5.4xlarge
- Gains 3-6 months
- Quick, no downtime (if prepared replica)

**Long-term (horizontal scaling)**:
- Shard by user_id or geographic region
- Each shard gets replicas
- Unlimited scalability
- Application-level complexity

**Recommended path**:
```
Month 1-3: Optimize queries + vertical scale (buy time)
Month 3-6: Implement sharding (parallel effort)
Month 6+: Run sharded system (replaces single DB)
```

---

### Q2: Design Netflix architecture for 100M users. What makes it resilient?

**Answer:**
**Key principles** (Netflix Chaos Engineering):

1. **Multi-AZ deployment**
   - Users in multiple regions/AZs
   - Any single AZ failure doesn't affect users

2. **Stateless services**
   - Any server can be killed
   - No local state = easy horizontal scaling

3. **Bulkheads (isolation)**
   - Video recommendations service fails
   - Homepage still works
   - Isolated failure domains

4. **Timeouts + Circuit breakers**
   - If recommendation service slow (>1s)
   - Don't wait, use cached/default recommendations
   - Fail fast

5. **Retry with backoff**
   - Transient failures auto-recover
   - Exponential backoff prevents thundering herd

**Architecture**:
```
User request → Load balancer (multi-AZ)
             ↓
      API Gateway (stateless)
             ↓
   Microservices (Video, Recommendation, Billing, etc.)
             ↓
   Each service has:
   - Multiple instances (horizontal scale)
   - Read replicas (HA)
   - Circuit breakers (cascading failure prevention)
   - Cache layer (Redis)
   - Timeout/retry logic
```

**Failure scenario**:
```
Video service crashes
  ↓
Circuit breaker opens (fails fast)
  ↓
User gets cached video list
  ↓
Meanwhile: Auto-scaler spins up new instances
  ↓
Service recovers in 30 seconds
  ↓
Circuit breaker closes (normal)
```

---

### Q3: Design a cache invalidation strategy.

**Answer:**
**Strategies** (in order of preference):

1. **TTL (Time-To-Live)**
   - Simple: `SET key value EX 3600` (1 hour TTL)
   - Pro: No coordination needed
   - Con: Stale data until expiry

2. **Event-based invalidation**
   - On data update: `PUBLISH user:123:updated`
   - Subscribers delete cache key
   - Pro: Instant invalidation, no stale data
   - Con: Complex, requires pub/sub

3. **Hybrid** (recommended)
   - TTL + event-based
   - Event invalidates immediately
   - TTL catches missed events (safety net)

**Implementation**:
```python
# Set with TTL
redis.setex("user:123", 3600, user_data)

# On update
db.update_user(123, new_data)
redis.publish("user:123:updated", json.dumps(new_data))

# Subscriber
def on_user_update(message):
    user_id = message['user_id']
    redis.delete(f"user:{user_id}")  # Immediate invalidation
    # Next request re-populates from DB
```

**Cache stampede mitigation**:
```
Multiple requests for same key after expiry
→ All hit DB simultaneously
→ Database overloaded

Solution: Probabilistic early expiry
```python
def get_user(user_id):
    cached = redis.get(f"user:{user_id}")
    if cached:
        ttl = redis.ttl(f"user:{user_id}")
        
        # If TTL < 10% remaining, refresh with probability
        if ttl < 360 and random.random() < 0.1:
            # One thread refreshes while others use stale
            refresh_in_background(user_id)
        
        return cached
    
    # Load from DB, set cache
    user = db.get(user_id)
    redis.setex(f"user:{user_id}", 3600, user)
    return user
```

---

### Q4: Design a system to survive an entire AWS region failure.

**Answer:**
**Active-Active multi-region** (required):

```
User requests → DNS routing (Route 53)
             ↓
      Geolocation/latency routing
             ↓
    Region 1 (US East)    Region 2 (US West)
    - App instances      - App instances
    - Database           - Database
    - Cache              - Cache
    
User in California → Route 53 sends to US West (lower latency)
User in Virginia → Route 53 sends to US East

If US East crashes:
  - Route 53 detects health check failure
  - All users → US West (higher latency but working)
```

**Database replication**:
```
Multi-master replication (MySQL, DynamoDB)
Region 1 DB ←→ Region 2 DB

Writes in Region 1 automatically replicate to Region 2
Writes in Region 2 automatically replicate to Region 1

If Region 1 fails:
  Users automatically failover to Region 2
  All data already there (already replicated)
  Zero data loss
```

**Cache/state**:
```
Don't store session state locally
Use distributed cache: DynamoDB or Redis Cluster
  - Spans multiple regions
  - User session survives region failure
```

**Cost trade-off**:
```
Single region: $1M/month
Multi-region: $2M/month (2x cost)

Benefit: Can survive region failure
         Netflix generates $300M/day revenue
         Region outage = $12M/hour loss
         
2x cost is cheaper than 1 hour downtime
```

---

### Q5: How many load balancers do you need for 10M concurrent connections?

**Answer:**
**Calculation**:

```
Modern load balancer (AWS ALB):
- Max 25,000 new connections per second
- 1M concurrent connections per instance

For 10M concurrent connections:
- 10M / 1M = 10 load balancers needed

But add redundancy:
- 2 regions × 10 LBs = 20 LBs
- Each region can lose 1 LB without impact
- High availability
```

**LB architecture**:
```
DNS (Route 53)
    ↓
US East: LB1, LB2, LB3, LB4, LB5 (can lose 1)
US West: LB6, LB7, LB8, LB9, LB10 (can lose 1)

If LB1 fails:
  - Route 53 detects
  - Traffic → LB2-5 (4 LBs instead of 5)
  - Users unaffected
```

**Connection distribution**:
```
Each connection = one TCP flow through LB
LB tracks: source_ip, dest_ip, port

With 10M connections:
- ~1M per LB
- Memory per connection: ~1-2KB
- 1M × 2KB = 2GB per LB (acceptable)
```

**Why not one giant LB?**
- Single point of failure
- Geographic latency (users far away)
- Doesn't scale beyond 1M connections

