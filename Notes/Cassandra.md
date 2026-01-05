# Apache Cassandra - Complete Deep Dive

## What is Cassandra?

**Apache Cassandra** is a distributed NoSQL database designed for high availability and horizontal scalability that enables:
- **Linear scalability**: Add nodes to increase throughput
- **No single point of failure**: Peer-to-peer architecture (no master)
- **High write throughput**: Millions of writes/second
- **Eventual consistency**: Trade strong consistency for availability
- **Multi-datacenter support**: Built-in geographic distribution
- **Tunable consistency**: Choose per query (consistency level)

### Core Characteristics

| Aspect | Benefit |
|--------|---------|
| **Distributed** | Peer-to-peer, all nodes equal |
| **Fault-tolerant** | Lose nodes, keep operating (RF=3) |
| **Scalable** | Linear throughput increase per node |
| **Durable** | Write-ahead logging + compaction |
| **Multi-DC** | Replicate across datacenters natively |
| **Eventually consistent** | High availability over strong consistency |

---

## Cassandra Architecture Overview

```
Client (via CQL driver)
       ↓
Cassandra Cluster
  ├─ Node 1 (Replicates: A-H)
  ├─ Node 2 (Replicates: I-P)
  ├─ Node 3 (Replicates: Q-Z)
  ├─ Node 4 (Replicates: A-H, I-P)
  └─ ...
       ↓
   [Token Ring] → [Hash Partitioning]
       ↓
   [SSTable (commit log + memtable)]
```

**Key layers:**
- **Cluster**: Collection of nodes sharing same cluster name
- **Node**: Single Cassandra instance
- **Keyspace**: Database-like container (schema definition)
- **Table**: Similar to relational database table
- **Partition Key**: Determines which node stores data
- **Token Ring**: Maps keys to nodes via consistent hashing
- **Replica**: Copy of partition on multiple nodes (replication factor)

---

## Core Components

### 1. Consistent Hashing & Token Ring

**Problem**: How to distribute data across nodes?

**Solution**: Consistent hashing with token ring

```
Token Ring (0 to 2^63-1):

      Node 1 (Token: 100)
             /\
       Node 2   Node 4
     (Token:    (Token:
      200)      400)
         \        /
        Node 3 (Token: 300)

Key "alice" → Hash → Token 150
  Belongs to: Node 1 (100-200)
  
Key "bob" → Hash → Token 250
  Belongs to: Node 3 (200-300)
  
Key "charlie" → Hash → Token 350
  Belongs to: Node 4 (300-400)
```

**Benefits:**
- Adding/removing nodes = minimal rebalancing
- Load balanced: Each node owns ~1/N of token space
- Replication: RF=3 means data on 3 consecutive nodes

**Replication placement:**

```
Replication Factor = 3

Key "user:123" → Token 150
  Primary (Node 1): Token 100-200
  Replica 1 (Node 2): Token 200-300
  Replica 2 (Node 3): Token 300-400
```

---

### 2. Keyspaces and Tables

**Keyspace**: Schema definition (similar to database)

```cql
CREATE KEYSPACE user_keyspace
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'us-east-1': 3,
  'eu-west-1': 2
}
AND durable_writes = true;
```

**Table**: Data structure (similar to table)

```cql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email TEXT,
  name TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

### 3. Data Model: Primary Key

**Simple primary key** (single column):
```cql
PRIMARY KEY (user_id)
  → Partition key: user_id
  → Clustering key: (none)
  
// All data with same user_id on same partition
```

**Composite primary key** (partition key + clustering key):
```cql
CREATE TABLE user_activity (
  user_id UUID,
  timestamp TIMESTAMP,
  action_type TEXT,
  action_data TEXT,
  PRIMARY KEY (user_id, timestamp)
);

WHERE user_id = ? AND timestamp >= ? AND timestamp < ?
```

**How it's stored:**

```
Partition key (user_id): Determines node
Clustering key (timestamp): Sort order within partition

Data on node:
  Partition: user_id=alice
    ├─ timestamp=2024-01-05 10:00:00 → "login"
    ├─ timestamp=2024-01-05 10:15:30 → "view_product"
    └─ timestamp=2024-01-05 10:30:45 → "logout"
  
  Partition: user_id=bob
    ├─ timestamp=2024-01-05 10:02:00 → "login"
    └─ timestamp=2024-01-05 10:05:15 → "purchase"
```

**Advantages:**
- Range queries: Get activity between timestamps efficiently
- Sorted results: Clustering key order preserved
- Efficient pagination: Skip to timestamp and fetch next N rows

---

### 4. Write Path

**Write operation flow:**

```
Client sends INSERT/UPDATE
       ↓
1. Write to commitlog (durability)
       ↓
2. Write to memtable (in-memory, sorted)
       ↓
3. Return success to client (write durability achieved)
       ↓
4. Periodically flush memtable → SSTable (on disk)
       ↓
5. Compaction merges SSTables
```

**Write acknowledgment flow:**

```
Client sends write with consistency_level = QUORUM
       ↓
Coordinator node:
  - Sends to all RF replicas
  - Waits for QUORUM responses (RF/2 + 1)
  - Returns success
       ↓
Consistency achieved:
  QUORUM = 3 nodes → need 2 acks
  If 1 node slow/down → still succeed
  Trade-off: Eventual consistency
```

---

### 5. Read Path

**Read operation flow:**

```
Client sends SELECT with consistency_level = QUORUM
       ↓
Coordinator node:
  - Queries primary replica + (RF-1) other replicas
  - Compares timestamps (read repair)
  - Returns latest version
       ↓
Read consistency guarantees:
  ONE: Fastest (1 node)
  QUORUM: Balanced (RF/2 + 1 nodes)
  ALL: Slowest but consistent (all RF nodes)
```

**Read repair:**

```
Scenario: Write to replica A succeeds, B is slow

Write to A (timestamp 100): SUCCESS
Write to B (timestamp 100): SLOW/TIMEOUT

Later, read from A and B:
  A: timestamp 100
  B: timestamp 90 (stale)
  
Read repair:
  Coordinator sees A > B
  Sends write to B to fix stale data
  Returns A's value
```

---

## Consistency & Availability Trade-offs

### Consistency Levels

| Level | Read from | Write to | Availability | Consistency |
|-------|-----------|----------|--------------|-------------|
| **ONE** | 1 node | 1 node | Highest | Lowest (stale) |
| **QUORUM** | RF/2 + 1 | RF/2 + 1 | Medium | Medium |
| **LOCAL_QUORUM** | Local DC quorum | Local DC quorum | Medium | Medium |
| **ALL** | All replicas | All replicas | Lowest (1 failure = fail) | Highest |

**Write consistency example** (RF=3):

```
Consistency ONE:
  Write to node A → Return success
  Risk: Nodes B,C haven't written yet (data loss if A fails)

Consistency QUORUM:
  Write to nodes A,B,C → Wait for 2 acks → Return success
  Risk: 1 node can fail safely

Consistency ALL:
  Write to nodes A,B,C → Wait for all 3 acks → Return success
  Risk: 1 node down = write fails (low availability)
```

**Hybrid consistency** (write QUORUM, read ONE):

```
Write QUORUM:
  Ensure at least 2 replicas have data

Read ONE:
  Read from fastest replica (very fast)
  Risk: Might be stale
  Mitigation: Read repair fixes stale data in background
```

---

## Replication & Distribution

### Replication Factor (RF)

```
RF=1: No replication (data loss on node failure)
RF=2: One replica (lose 1 node, still serve)
RF=3: Two replicas (lose 2 nodes, still serve)
RF=5: Four replicas (lose 4 nodes, still serve)

Production: Use RF=3 minimum
Multi-DC: Distribute replicas across DCs
  us-east: RF=2
  eu-west: RF=1
```

### Multi-Datacenter Replication

```cql
CREATE KEYSPACE events
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'us-east-1': 3,      // 3 replicas in US
  'eu-west-1': 2       // 2 replicas in EU
};
```

**Data flow:**

```
Write in US-East:
  1. Write to primary + replicas (US-East)
  2. Replicates asynchronously to EU-West
  3. EU replicas eventually consistent

Benefits:
  - Local reads (low latency)
  - Local writes (high throughput)
  - Automatic cross-DC replication

Trade-off:
  - Eventual consistency (EU lags behind US)
  - Cross-DC bandwidth usage
```

---

## Compaction Strategy

**Problem**: Many writes create many SSTables (slow reads)

**Solution**: Compaction merges SSTables

```
Initial state (4 SSTables):
  SSTable1: Keys A, M, Z
  SSTable2: Keys A, G, M
  SSTable3: Keys B, K, X
  SSTable4: Keys C, D, L

Read request for key M:
  Check SSTable1 (found)
  Check SSTable2 (might have newer)
  Check SSTable3 (no)
  Check SSTable4 (no)
  → Query multiple SSTables (slow)

After compaction:
  SSTable-merged: Keys A, B, C, D, G, K, L, M, X, Z (sorted)
  → Single SSTable (fast)
```

**Compaction strategies:**

| Strategy | Use Case | Trade-off |
|----------|----------|-----------|
| **Size-tiered** | Default, write-heavy | More read overhead |
| **Leveled** | Read-heavy | More write overhead |
| **Time-window** | Time-series data | Good balance for events |

---

## Performance Optimization

### Write Optimization

```cql
-- Batch writes for throughput
BEGIN BATCH
  INSERT INTO users (user_id, email) VALUES (?, ?)
  INSERT INTO user_index (email, user_id) VALUES (?, ?)
APPLY BATCH;

-- Async writes (fire-and-forget)
consistency_level = ONE
timeout = 100ms

-- Tune commit log settings
commitlog_sync = batch
commitlog_sync_batch_window_in_ms = 10
```

### Read Optimization

```cql
-- Use secondary indexes for filtering
CREATE INDEX idx_email ON users (email);

-- Projection: Select only needed columns
SELECT user_id, email FROM users WHERE user_id = ?;
-- Not: SELECT * FROM users WHERE user_id = ?;

-- Pagination
SELECT * FROM users WHERE user_id = ? LIMIT 100;
-- Fetch next page using last key

-- Caching
SELECT * FROM users WHERE user_id = ? USING CACHE;
```

### Hardware Configuration

```properties
# Memory allocation
-Xms8g -Xmx8g

# Data directory (fast SSD)
data_file_directories: ["/mnt/data/cassandra"]
commitlog_directory: "/mnt/commitlog"

# Network tuning
max_hints_window_in_ms: 10800000
seed_provider:
  - class_name: org.apache.cassandra.locator.SimpleSeedProvider
    parameters:
      - seeds: "192.168.1.1,192.168.1.2"

# Concurrency
concurrent_reads: 32
concurrent_writes: 32
```

---

## Scalability & High Availability

### Cluster Sizing

**Small cluster** (3-5 nodes):
```
Handles: 100K-1M ops/sec
Per node: SSD 500GB, 16GB RAM
Use case: Development, testing
```

**Medium cluster** (6-20 nodes):
```
Handles: 1M-10M ops/sec
Per node: SSD 2TB, 32GB RAM
Use case: Production, single DC
```

**Large cluster** (20+ nodes):
```
Handles: 10M+ ops/sec
Per node: SSD 4TB+, 64GB RAM
Use case: High-scale, multi-DC
```

### High Availability Strategy

```
Single node failure:
  ✓ No impact (RF=3 has 2 other replicas)
  ✓ Automatic failover (read from other replicas)
  
Multiple node failure:
  ✓ Still operational (if RF > number of failures)
  ✗ Reduced throughput (fewer replicas)
  ✗ Possible data loss (if failures > RF-1)

Entire DC failure:
  ✓ Application fails over to other DC
  ✓ Data preserved (multi-DC replication)
  ✗ Possible write losses (async replication)
```

### Repair Mechanism

```
Repair ensures replicas are consistent:

Command:
  nodetool repair -pr user_keyspace

Process:
  1. Merkle tree of local node
  2. Compare with replica nodes
  3. Stream missing/stale data
  4. Replicas become consistent

Schedule:
  Weekly or after RF-1 nodes fail
  Run during low-traffic window
```

---

## Use Cases

### 1. Time-Series Data (Metrics, Logs)

```cql
CREATE TABLE metrics (
  metric_name TEXT,
  timestamp TIMESTAMP,
  host TEXT,
  value FLOAT,
  PRIMARY KEY ((metric_name, host), timestamp)
);

-- Insert millions/sec
INSERT INTO metrics VALUES ('cpu', now(), 'server1', 85.5);

-- Range query (efficient with clustering)
SELECT * FROM metrics 
WHERE metric_name = 'cpu' 
  AND host = 'server1'
  AND timestamp >= ? AND timestamp < ?;
```

### 2. User Profiles & Activity

```cql
CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  email TEXT,
  name TEXT,
  bio TEXT
);

CREATE TABLE user_activity (
  user_id UUID,
  timestamp TIMESTAMP,
  action TEXT,
  PRIMARY KEY (user_id, timestamp)
);

-- Fast user lookup + activity range query
SELECT * FROM users WHERE user_id = ?;
SELECT * FROM user_activity 
WHERE user_id = ? AND timestamp >= ? AND timestamp < ?;
```

### 3. Message Queue (Kafka-like)

```cql
CREATE TABLE messages (
  topic TEXT,
  partition INT,
  offset BIGINT,
  timestamp TIMESTAMP,
  payload BLOB,
  PRIMARY KEY ((topic, partition), offset)
);

-- Write millions/sec (high throughput)
INSERT INTO messages VALUES ('events', 0, 1000, now(), payload);

-- Consumer reads offset range
SELECT * FROM messages 
WHERE topic = 'events' AND partition = 0 
  AND offset >= ? AND offset <= ?
LIMIT 1000;
```

### 4. Real-time Analytics

```cql
CREATE TABLE events (
  event_type TEXT,
  day TEXT,
  hour TEXT,
  timestamp TIMESTAMP,
  user_id UUID,
  data MAP<TEXT, TEXT>,
  PRIMARY KEY ((event_type, day, hour), timestamp)
);

-- Aggregate within partition (efficient)
SELECT COUNT(*), AVG(price) FROM events
WHERE event_type = 'purchase' AND day = '2024-01-05'
GROUP BY hour;
```

---

## Interview Questions & Answers

### Q1: Design a real-time analytics system for 1M events/sec

**Requirements:**
- Ingest 1M events/sec
- Aggregate by event type, time windows (hourly, daily)
- Query: "Count purchases in last hour"
- 99.99% uptime

**Solution:**

```cql
CREATE KEYSPACE analytics 
WITH replication = {
  'class': 'NetworkTopologyStrategy',
  'us-east': 3,
  'eu-west': 2
};

-- Time-series partitioning (efficient range queries)
CREATE TABLE events (
  event_type TEXT,
  bucket TEXT,           -- Partition by hour (2024-01-05-10)
  timestamp TIMESTAMP,
  event_id UUID,
  user_id UUID,
  data TEXT,
  PRIMARY KEY ((event_type, bucket), timestamp, event_id)
);

-- Aggregation table (pre-computed)
CREATE TABLE event_counts (
  event_type TEXT,
  bucket_hour TEXT,      -- Hour bucket
  count_value BIGINT,
  PRIMARY KEY (event_type, bucket_hour)
);
```

**Write path:**

```python
# High-throughput insert
from cassandra.cluster import Cluster
from datetime import datetime
from uuid import uuid4

cluster = Cluster(['node1', 'node2', 'node3'])
session = cluster.connect('analytics')

# Batch writes for throughput
prepared = session.prepare('''
  INSERT INTO events (
    event_type, bucket, timestamp, event_id, user_id, data
  ) VALUES (?, ?, ?, ?, ?, ?)
''')

for event in events_stream:
  bucket = event['timestamp'].strftime('%Y-%m-%d-%H')
  session.execute(prepared, [
    event['type'],
    bucket,
    event['timestamp'],
    uuid4(),
    event['user_id'],
    event['data']
  ], consistency_level=ConsistencyLevel.QUORUM)
```

**Read path (queries):**

```cql
-- Count events in last hour
SELECT COUNT(*) FROM events
WHERE event_type = 'purchase'
  AND bucket = '2024-01-05-10'
  AND timestamp >= ? AND timestamp < ?;

-- Top products (via aggregation)
SELECT product_id, COUNT(*) as count
FROM events
WHERE event_type = 'view' AND bucket = '2024-01-05-10'
GROUP BY product_id
LIMIT 10;
```

**Cluster setup:**

```
3 nodes per DC × 2 DCs = 6 nodes
Per node: 
  - 4 CPU
  - 32GB RAM
  - 2TB SSD (write-optimized)
  
Throughput: 1M events/sec ÷ 6 nodes = 167K/sec per node
(Cassandra handles 100K+/sec per node)
```

---

### Q2: Node fails. How to recover without data loss?

**Answer:**

**Failure scenarios with RF=3:**

```
Scenario 1: 1 node fails
  ✓ No impact (2 replicas still have data)
  ✓ Automatic failover (read from other replicas)
  ✓ No data loss
  
Scenario 2: 2 nodes fail simultaneously
  ⚠️ Depends on replication placement
  - If failures are on different DC: OK
  - If failures are on same DC: Possible data loss
  
Scenario 3: Node recovers after being down
  1. Node rejoins cluster
  2. Detects lag (missing writes while down)
  3. Repair fills in missing data
```

**Recovery process:**

```bash
# 1. Node comes back online
# Cassandra detects missed writes (hints)

# 2. Run repair (forces consistency)
nodetool repair -pr user_keyspace

# 3. Monitor repair progress
nodetool netstats

# 4. Verify data consistency
nodetool ring
```

**Hint system** (prevents write loss):

```
Write to A, B (C is down):
  A: success
  B: success
  C: (down, store hint locally)

When C recovers:
  Hints replay → C catches up with missed writes
  
Trade-off:
  - Hints stored locally on coordinator
  - If coordinator fails before replay → loss possible
  - Mitigation: Enable hint window (replay within N hours)
```

**Key takeaway**: "With RF=3, lose 1 node = no impact. Lose 2+ nodes = possible data loss. Always run `nodetool repair` weekly."

---

### Q3: Strong consistency requirement (financial transactions). How to achieve?

**Answer:**

**Challenge**: Cassandra is eventually consistent by default

**Solution: Hybrid consistency**

```cql
-- Use QUORUM consistency on writes
INSERT INTO accounts (account_id, balance) VALUES (?, ?)
USING CONSISTENCY QUORUM;

-- Use QUORUM consistency on reads
SELECT balance FROM accounts 
WHERE account_id = ?
USING CONSISTENCY QUORUM;

-- With RF=3:
--   QUORUM = 2 nodes
--   Write to 2 nodes + read from 2 nodes = strong consistency
```

**Trade-offs:**

```
QUORUM consistency:
  ✓ Strong consistency (within same node set)
  ✓ Withstand 1 node failure (RF=3)
  ✗ Slower than ONE (need to reach 2 nodes)
  ✗ Fails if 2+ nodes down (can't get quorum)

Availability impact:
  ONE: Always available (unless all replicas down)
  QUORUM: Available if > RF/2 replicas up
    RF=3, need 2 alive: Can lose 1 node
    RF=5, need 3 alive: Can lose 2 nodes
```

**Read-before-write pattern:**

```cql
-- For balance updates (prevent race conditions)
SELECT balance FROM accounts 
WHERE account_id = ? 
USING CONSISTENCY QUORUM;

-- Compute new balance
new_balance = balance - withdrawal;

-- Update with conditional write (lightweight transaction)
UPDATE accounts SET balance = ?
WHERE account_id = ?
IF balance = ?;  -- Only update if balance unchanged
```

**Lightweight transactions (LWT):**

```cql
-- Atomic compare-and-set
UPDATE accounts SET balance = 950
WHERE account_id = 'user1'
IF balance = 1000;  -- Conditional

// Under the hood:
// 1. Read current balance from QUORUM (consensus)
// 2. If matches condition, write to QUORUM
// 3. Atomic within cluster
```

**Key takeaway**: "Use QUORUM consistency + lightweight transactions for strong consistency guarantees, but accept higher latency."

---

### Q4: Query latency spike. How to diagnose?

**Answer:**

**Diagnosis checklist:**

```bash
# 1. Check cluster health
nodetool status

# 2. Check node load
nodetool info

# 3. Monitor GC pauses
nodetool gcstats

# 4. Check compaction queue
nodetool compactionstats

# 5. Monitor disk I/O
iostat -x 1

# 6. Check slow queries (enable query logging)
nodetool settraceprobability 1.0

# 7. Analyze trace
SELECT * FROM system_traces.sessions 
WHERE session_id = ?;
```

**Common causes and solutions:**

| Problem | Cause | Fix |
|---------|-------|-----|
| **High read latency** | Bloom filter miss (SSTable scan) | Reduce number of SSTables (compact) |
| **High write latency** | Too many SSTables | Run compaction |
| **GC pauses** | Large heap allocations | Reduce batch size, increase heap |
| **Disk I/O bottleneck** | Random reads from disk | Ensure hot data in cache |
| **Unbalanced cluster** | Uneven token distribution | Rebalance tokens |
| **Hot partition** | Single key receiving all traffic | Use partition sharding (add dimension) |

**Hot partition mitigation:**

```
Problem: User 'celebrity' has 1M followers
         Everyone writes to their followers_list partition
         
Before (hot):
  CREATE TABLE followers (
    user_id UUID PRIMARY KEY,
    follower_id UUID,
    PRIMARY KEY (user_id, follower_id)
  );
  // All writes go to celebrity's partition (bottleneck)

After (sharded):
  CREATE TABLE followers (
    user_id UUID,
    shard_id INT,
    follower_id UUID,
    PRIMARY KEY ((user_id, shard_id), follower_id)
  );
  // Distribute across 10 shards (10x improvement)
  
  INSERT INTO followers VALUES (celebrity, shard_id=0, user1);
  INSERT INTO followers VALUES (celebrity, shard_id=1, user2);
  // Writes distribute across 10 partitions
```

---

### Q5: Design a distributed cache (like Redis) with Cassandra durability

**Answer:**

**Architecture:**

```
Cache layer + Cassandra durability:
  - Memcached/Redis layer (fast, in-memory)
  - Cassandra layer (durable, persistent)
  
Write flow:
  Client → Memcached (confirm) → Write to Cassandra (background)

Read flow:
  Client → Memcached (cache hit, fast) 
        → Cassandra (cache miss, slower)
        → Memcached (populate cache)
```

**Implementation:**

```cql
CREATE TABLE cache (
  cache_key TEXT PRIMARY KEY,
  value BLOB,
  ttl INT,
  created_at TIMESTAMP
);

-- Insert with TTL (auto-delete after expiry)
INSERT INTO cache (cache_key, value, created_at) 
VALUES (?, ?, now())
USING TTL 3600;  // Auto-delete after 1 hour

-- Read with consistency ONE (fast, from cache)
SELECT value FROM cache 
WHERE cache_key = ?
USING CONSISTENCY ONE;
```

**Cache invalidation strategy:**

```python
# Write-through cache
def get_user(user_id):
    # Check Memcached first
    cached = memcached.get(f"user:{user_id}")
    if cached:
        return cached
    
    # Cache miss, read from Cassandra
    user = cassandra.select("user_id = ?", user_id)
    
    # Populate cache
    memcached.set(f"user:{user_id}", user, ttl=1hour)
    return user

def update_user(user_id, data):
    # Update Cassandra
    cassandra.update("user_id = ?", user_id, data)
    
    # Invalidate cache
    memcached.delete(f"user:{user_id}")
```

**Durability guarantees:**

```
Write QUORUM + async Cassandra write:
  1. Write to Memcached (in-memory, fast)
  2. Write to Cassandra QUORUM (durable)
  3. Memcached loss ≠ data loss (Cassandra has it)
  
If Memcached fails:
  Cassandra still has data
  Repopulate Memcached on read (cache miss)
```

---

## Cassandra vs Alternatives

| System | Throughput | Latency | Best For | Trade-off |
|--------|-----------|---------|----------|-----------|
| **Cassandra** | 1M+/sec | 5-20ms | High-write, distributed | Eventual consistency |
| **DynamoDB** | 100K+/sec | 5-10ms | Managed, serverless | AWS vendor lock-in |
| **HBase** | 100K+/sec | 10-50ms | Hadoop ecosystem | Operational complexity |
| **MongoDB** | 100K+/sec | 5-20ms | Document flexibility | ACID trade-offs |
| **Redis** | 1M+/sec | 1-5ms | In-memory cache | No persistence (custom) |

---

## Best Practices

### Data Modeling

✓ **Denormalize** (opposite of relational databases)
✓ **Design tables around queries** (not entities)
✓ **Avoid hot partitions** (use sharding if needed)
✓ **Keep partition size < 100MB** (optimal SSTable size)
✓ **Use composite keys** (partition key + clustering key)
✓ **Plan for time-series** (bucket by hour/day)

### Operational Best Practices

✓ **Always use RF ≥ 3** (production minimum)
✓ **Monitor compaction** (queue shouldn't grow unbounded)
✓ **Run repairs weekly** (prevents data divergence)
✓ **Monitor GC pauses** (tune heap if > 100ms)
✓ **Use local_quorum** for multi-DC (reduce latency)
✓ **Plan capacity** (monitor disk growth)
✓ **Enable client-side caching** (reduce read load)

### Query Optimization

✓ **Partition key must be in WHERE clause** (required)
✓ **Use clustering key for range queries** (efficient)
✓ **Avoid large result sets** (use LIMIT)
✓ **Batch writes** (higher throughput)
✓ **Use prepared statements** (prevent re-parsing)
✓ **Fetch only needed columns** (reduce network I/O)

---

## Disaster Recovery Strategy

### Single-Datacenter Failure

| Failure Mode | RF=3 | Impact | Recovery |
|--------------|------|--------|----------|
| 1 node down | ✓ Safe | No impact | Auto (replicas serve) |
| 2 nodes down | ⚠️ Risky | Partial data loss possible | Repair after recovery |
| 3+ nodes down | ✗ Loss | Complete data loss | Restore from backup |

### Multi-Datacenter Failover

```
Primary DC (US-East): 3 nodes, RF=3
Secondary DC (EU-West): 2 nodes

Failure: Entire US-East goes down
  - EU still has RF=2 replicas
  - All data preserved
  - Failover time: seconds (client retries)
  - Trade-off: Possible data loss if RF < DC failures
  
Solution: Use RF=5, distribute replicas
  US-East: 3 replicas
  EU-West: 2 replicas
  → Lose entire DC, data survives
```

### Backup and Recovery

```bash
# Snapshot (consistent backup)
nodetool snapshot user_keyspace

# Upload to S3
tar -czf snapshot.tar.gz /var/lib/cassandra/snapshots/
aws s3 cp snapshot.tar.gz s3://cassandra-backups/

# Restore from snapshot
# 1. Restore SSTables to node
# 2. Run repair to sync
nodetool repair -pr user_keyspace
```

---

## Summary & Key Takeaways

**Cassandra excels at:**
- ✓ High write throughput (1M+ writes/sec)
- ✓ Linear scalability (add nodes, increase capacity)
- ✓ High availability (distributed, no single point of failure)
- ✓ Multi-datacenter support (native geo-replication)
- ✓ Time-series data (efficient range queries)

**Key challenges:**
- ✗ Eventual consistency (not strong by default)
- ✗ Operational complexity (cluster management, repairs)
- ✗ Query flexibility (must design tables per query)
- ✗ Learning curve (CQL, data modeling, tuning)
- ✗ No transactions (no ACID, eventual consistency)

**Critical design questions:**
1. What's my write throughput requirement (ops/sec)?
2. Do I need strong consistency or eventual is OK?
3. How long must I retain data?
4. What's my acceptable data loss (RPO)?
5. Do I need multi-datacenter replication?
6. What queries must I support (design tables)?
7. Can I handle operational complexity?

