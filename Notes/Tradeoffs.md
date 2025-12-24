# System Design Tradeoffs Guide - Master Index

A comprehensive reference for understanding key tradeoffs in system design interviews. This guide explains when to use each approach, why, and what you gain or sacrifice.

---

## Complete Topic List

This master guide has been divided into focused topic files for easier reference. Each file contains:
- Detailed comparison tables
- Deep dives with examples
- Real-world tradeoff analysis
- **Interview questions with answers**

### 1. [Database Tradeoffs](./01-Database-Tradeoffs.md)
SQL vs NoSQL, common databases, geospatial queries (PostgreSQL + PostGIS, Redis Geo, MongoDB, Elasticsearch, DynamoDB, S2/H3 geometry), read replicas vs sharding, normalization vs denormalization, data structures & indexing

**Key topics:**
- When to use SQL vs NoSQL
- Location query patterns (Uber, food delivery, GIS)
- Scaling strategies (read replicas, sharding, geo-partitioning)

### 2. [Caching Strategies](./02-Caching-Strategies.md)
Cache Aside, Write-Through, Write-Behind, Refresh-Ahead patterns with deep dives, TTL strategies, cache invalidation, cache stampede solutions

**Key topics:**
- Cache pattern selection
- TTL tuning for different use cases
- Preventing cascading failures

### 3. [API Design](./03-API-Design.md)
REST vs gRPC vs GraphQL vs WebSockets vs SSE vs WebHooks with comprehensive comparison table, detailed pros/cons, when to use each, real-time patterns

**Key topics:**
- API pattern selection matrix
- Real-time communication (WebSockets vs SSE)
- Mobile vs server API design

### 4. [Storage Tradeoffs](./04-Storage-Tradeoffs.md)
Object Storage (S3) vs Block Storage (EBS) vs File Storage (EFS/NFS), decision matrix, cost analysis, Instagram/Dropbox design examples

**Key topics:**
- Storage type selection
- Cost optimization strategies
- Cloud storage architecture

### 5. [Communication Patterns](./05-Communication-Patterns.md)
Synchronous vs Asynchronous, polling patterns (short/long polling, WebSockets, SSE), message queues (Pub/Sub vs Queue), chaos engineering, retry mechanisms with exponential backoff

**Key topics:**
- Service communication patterns
- Message queue strategies
- Failure handling and resilience

### 6. [Scalability & Reliability](./06-Scalability-Reliability.md)
Vertical vs Horizontal scaling, CAP theorem, load balancing strategies, replication patterns, circuit breaker pattern, multi-region failover, disaster recovery

**Key topics:**
- Scaling decision making
- High availability patterns
- Fault tolerance strategies

### 7. [Data Processing](./07-Data-Processing.md)
Batch vs Stream processing, Lambda vs Kappa architecture, tools comparison (Spark, Flink, Kafka Streams, Kinesis), real-time analytics, data warehouse design for scale

**Key topics:**
- Batch vs stream tradeoffs
- Real-time analytics at scale
- Fraud detection and recommendation systems

### 8. [Architecture Patterns](./08-Architecture-Patterns.md)
Monolith vs Microservices, architecture evolution, when to migrate, data consistency across services, saga pattern, service design principles

**Key topics:**
- Monolith vs microservices decision
- Distributed transaction patterns
- Service boundary design

---

## Original Full Document

Below is the complete original content (kept for reference). For focused learning, refer to individual topic files above.

---

---

## Database Tradeoffs

### SQL vs NoSQL

| Aspect | SQL (Relational) | NoSQL | When to Use |
|--------|-----------------|-------|-------------|
| **Data Model** | Structured, fixed schema with relations | Flexible schema, document/key-value/graph | Use SQL for complex relationships; NoSQL for flexible, rapidly changing data |
| **ACID Compliance** | Strong ACID guarantees | Often eventual consistency (some offer ACID) | Use SQL for financial transactions; NoSQL for high throughput, eventual consistency OK |
| **Scalability** | Vertical scaling (scale up); horizontal with sharding complexity | Horizontal scaling built-in | Use SQL for moderate scale; NoSQL for massive scale-out needs |
| **Query Flexibility** | Rich SQL queries, joins, aggregations | Limited queries; optimized for specific access patterns | Use SQL for ad-hoc analytics; NoSQL for known access patterns |
| **Performance** | Slower writes due to ACID overhead; optimized reads with indexes | Fast writes; read performance depends on data model | Use SQL for read-heavy with complex queries; NoSQL for write-heavy workloads |
| **Examples** | MySQL, PostgreSQL, Oracle | MongoDB, Cassandra, DynamoDB, Redis | |

**Why Choose SQL:**
- Need strong consistency and ACID transactions (banking, e-commerce orders)
- Complex queries with multiple joins (reporting, analytics)
- Well-defined schema that doesn't change frequently
- Team expertise with SQL

**Why Choose NoSQL:**
- Need to scale horizontally to handle massive traffic (social media feeds, IoT)
- Schema flexibility for rapidly evolving features (startups, prototyping)
- Simple key-value or document lookups (user profiles, session storage)
- Geographic distribution with eventual consistency acceptable

**Tradeoff Summary:**
- SQL: Consistency + Complex Queries ↔ Harder to scale horizontally
- NoSQL: Scalability + Flexibility ↔ Limited query capabilities, eventual consistency

### Common Databases: When to Use What

| DB | Model | Strengths | Best For | Watchouts |
|----|-------|-----------|----------|-----------|
| **DynamoDB** | Managed key-value/document | Serverless, predictable latency, auto-scaling, TTLs | Massive scale key-value lookups, bursty traffic, IoT/session/user settings | Hot partitions cost $$, limited query patterns, single-table design learning curve |
| **Cassandra** | Wide-column (AP) | Linear write scaling, multi-region friendly, tunable consistency | Write-heavy time-series/logs/metrics, large append-only datasets | Eventual consistency by default, partition-key centric modeling, tombstone/GC tuning |
| **PostgreSQL** | Relational | Strong ACID, rich SQL/JSONB, extensions (PostGIS/FDW), mature tooling | OLTP with complex queries/joins, moderate scale analytics, transactional workloads | Vertical limits; sharding/replica mgmt needed at very high scale; tune vacuum/autovacuum |
| **MySQL** | Relational | Battle-tested, easy ops, good replication, wide ecosystem | Simpler OLTP, LAMP stacks, read-heavy with replicas | Manual sharding at scale, fewer advanced SQL features vs Postgres, replica lag considerations |
| **MongoDB** | Document | Flexible schema, rich queries and indexes, good developer velocity | Evolving schemas (content/user profiles), nested documents, moderate real-time reads | Data integrity relies on schema discipline; multi-doc transactions newer; large/hot docs hurt |
| **Neo4j** | Graph | Native graph traversals, expressive Cypher queries | Highly connected data (social, fraud rings, recommendations, network/topology) | Not optimized for wide OLTP; different scaling model; specialized skill set/licensing |
| **Other quick picks** | | Redis: ultra-fast cache/leaderboards; Snowflake/BigQuery: analytics; Elasticsearch/OpenSearch: search/logs | Use per specialized need | Each adds infra/ops cost; keep surface area small |

**How to decide quickly:** Start with PostgreSQL or MySQL for most OLTP apps; pick DynamoDB/Cassandra when horizontal write scaling and simple access patterns dominate; choose MongoDB for flexible schemas without heavy joins; reach for graph (Neo4j) only when relationships are the core query.

---

### Geospatial/Location Query Tradeoffs

| Solution | Technology Stack | Strengths | Best For | Watchouts |
|----------|------------------|-----------|----------|-----------|
| **PostgreSQL + PostGIS** | SQL + Spatial Extension | Powerful spatial functions (within, distance, nearest); supports complex geometries (polygons, multipolygons); ACID transactions; excellent for analytics | Ride-sharing (nearby drivers), location filtering with complex queries, geographic analytics, multi-criteria location searches | Scales vertically; sharding complexity increases; slower on massive datasets; slower than specialized geo DBs for simple queries |
| **Redis Geo Commands** | In-memory key-value with geo module | Ultra-fast lookups (O(log N)); perfect for leaderboards/nearby lists; built-in sorting by distance; simple radius/bbox queries | Real-time "nearby" queries (food delivery partners, rideshare), leaderboards with location, sessions with geo data | Limited query complexity; no persistence (need RDB/AOF); doesn't handle complex polygons; re-indexes required for updates; memory-intensive |
| **MongoDB + Geospatial Indexes** | Document DB with 2dsphere/2d indexes | Flexible schema with geo data; supports complex geometries (multipoint, polygon); good scaling via sharding; TTL indexes for sessions | Location-based social features (check-ins), user discovery within region, delivery zone filtering with flexible data model | Slower than Redis for simple queries; index memory overhead; aggregation pipeline for complex geo + filters can be expensive; 2dsphere slower than 2d for simple radius |
| **Elasticsearch/OpenSearch** | Search engine with geo plugin | Fast range/radius searches; excellent for combining location + full-text search (e.g., "restaurants near me"); aggregations by geo grid/distance | Location-based search (nearby restaurants), autocomplete with geo filtering, geo-bucketing analytics | Not ideal for pure location queries (overkill); writes slower than reads; not ACID; large memory footprint; indexing cost high |
| **DynamoDB + Geo Partitioning** | Managed NoSQL with custom sharding | Serverless, predictable latency, auto-scaling; good for simple location lookups with partition key design | Mobile apps with bursty location traffic, session management by region, geo-distributed user profiles | Complex geo queries nearly impossible; single-table design learning curve; hot partitions if users cluster in one area; range queries limited; need pre-computed geohashes |
| **S2 Geometry (Google's library)** | Geometric library used with any DB | Hierarchical space-filling curves; consistent cell boundaries globally; handles poles/datelines correctly; efficient bit operations | Global tile-based systems, precise location-to-cell mapping, seamless cross-region queries, geographic hierarchies | Not a database; requires implementation effort; learning curve steep; requires pre-processing locations into cells |
| **H3 Hexagonal Index** | Hierarchical hexagonal grid (Uber's) | Hexagonal cells (no biasing); great for aggregations by region; consistent parent-child hierarchy; smaller cell sizes than S2 | Uber-style mapping (hexagonal heat maps), fleet optimization, region-based analytics, disaster response zones | Pre-processing cost; not native to all databases; larger index than geohash; client-side computation overhead |
| **Geohash-based Sharding** | Custom partitioning strategy | Simple implementation; reduces range query complexity; can be pre-computed | Distributed systems needing geo-aware sharding, pre-computing user regions, hot-spot mitigation | Approximation (cell boundaries don't match exact distances); requires custom code; ordering by distance not native; geohash collision edge cases |
| **Neo4j with Spatial Data** | Graph DB with spatial plugin | Graph-native geospatial traversals; relationship-based location logic (friends near you); strong for social/location networks | Social networks with location relationships (friends near me), recommendation systems with geo filters, network topology with locations | Overkill for pure location queries; scaling challenges for massive graphs; spatial queries not as optimized as PostGIS |

---

#### **Detailed Decision Flowchart: Location Queries**

**Question 1: How many location queries per second (QPS)?**
- **< 100 QPS**: PostgreSQL + PostGIS (simplicity, ACID, complex queries)
- **100-10K QPS**: Redis Geo or MongoDB (fast reads, moderate scaling)
- **> 10K QPS**: Redis Geo + PostgreSQL (Redis for hot reads, Postgres for cold/complex)

**Question 2: Query complexity?**
- **Simple radius/nearby**: Redis Geo or DynamoDB Geo Partitioning (blazing fast)
- **Radius + filters (distance + category)**: MongoDB Geo Indexes or Elasticsearch
- **Complex polygons + analytics**: PostgreSQL + PostGIS
- **Full-text search + location**: Elasticsearch with geo plugin

**Question 3: Scale and data distribution?**
- **Single region, < 10GB data**: PostgreSQL + PostGIS
- **Multi-region, high write volume**: DynamoDB Geo Partition (serverless) or Redis Geo + Postgres replication
- **Globally distributed users**: S2/H3 geohash + DynamoDB or Cassandra (pre-compute regions)

**Question 4: Consistency requirements?**
- **Strong consistency critical**: PostgreSQL + PostGIS (ACID transactions)
- **Eventual consistency acceptable**: Redis Geo (cache layer), MongoDB, Elasticsearch

**Question 5: Need real-time updates?**
- **Yes (food delivery, rideshare)**: Redis Geo (TTL for expiring locations) + pub/sub for updates
- **Not critical**: PostgreSQL + PostGIS with caching, DynamoDB

---

#### **Common Location Query Patterns**

| Pattern | Best Solution | Why | Example |
|---------|---------------|-----|---------|
| **Find nearby (radius search)** | Redis Geo with GEORADIUS | O(log N) with distance sorting; <10ms latency | "Nearby restaurants within 5km" |
| **K-nearest neighbors** | MongoDB Geo Aggregate Pipeline or PostGIS | Both efficient; MongoDB for flexible schema, PostGIS for complex geometries | "5 closest Uber drivers" |
| **Bounding box (rectangular region)** | Redis GEORADIUSBYMEMBER or PostgreSQL | Redis for speed; PostGIS for accurate geography | "All delivery zones in viewport" |
| **Point-in-polygon (user in zone)** | PostgreSQL PostGIS ST_Contains | Handles complex polygon boundaries; ACID safe | "Is delivery address within service area?" |
| **Distance matrix (many-to-many)** | PostgreSQL PostGIS or S2 geometry | PostGIS for accuracy; S2 for pre-computation | Route optimization, distance between all depot-customer pairs |
| **Geofence (notify when entering region)** | Redis Geo + streams or DynamoDB Geo + Lambda | Redis for hot geofences; DynamoDB for serverless | Geo-triggered notifications, store crossing alerts |
| **Aggregation by region (heatmap)** | Elasticsearch Geo Aggregate or H3 bucketing | Elasticsearch for combined geo + analytics; H3 for custom regions | "Orders by delivery zone", "traffic density map" |
| **Hierarchical regions (country→state→city)** | PostgreSQL PostGIS + hierarchical tables or S2/H3 | PostGIS for ACID joins; S2/H3 for cell hierarchies | "All cities in California with avg distance" |

---

#### **Real-World Trade-offs: Examples**

**Use PostgreSQL + PostGIS when:**
- Complex multi-criteria queries (distance + polygon + filters)
- ACID consistency critical (financial transactions with locations)
- Moderate QPS (<1K), accept eventual caching layer
- Team familiar with SQL and spatial extensions
- Example: Ride-sharing pricing zone verification, property boundary queries

**Use Redis Geo when:**
- Simple radius searches dominate (nearby driver/restaurant queries)
- Real-time, sub-millisecond latency required
- Can tolerate eventual consistency (cache layer over DB)
- User locations change frequently (need TTL auto-expire)
- Example: Uber finding nearby drivers, food delivery "nearby restaurants"

**Use MongoDB Geo Indexes when:**
- Flexible schema with location data (user profiles with optional location)
- Combining location filters with other document queries
- Moderate QPS with geographic scaling via sharding
- Example: Dating app "find matches within 20 miles who like hiking"

**Use Elasticsearch Geo when:**
- Location search + full-text search together (restaurants near me + name search)
- Complex aggregations (heatmaps, zone analytics)
- Accept higher latency (100ms+) for powerful analytics
- Example: Job search "Software engineer jobs in NYC area"

**Use DynamoDB Geo Partitioning when:**
- Serverless, minimal ops requirement
- Predictable location distribution (geohash bucket design)
- Can pre-compute regions (avoid hot partitions)
- Example: Mobile app tracking user sessions by region, IoT device location tracking

**Use S2/H3 Geometry Libraries when:**
- Building custom tiling/hexagonal systems
- Globally accurate cells (poles, datelines matter)
- Pre-computing expensive: heatmaps, regional aggregations
- Example: Uber's hexagon-based fleet optimization, disaster response zone mapping

---

### Read Replicas vs Sharding

| Aspect | Read Replicas | Sharding (Horizontal Partitioning) | When to Use |
|--------|---------------|-----------------------------------|-------------|
| **Purpose** | Scale read throughput | Scale both reads and writes; handle large datasets | Use replicas for read-heavy; sharding for write-heavy or large data |
| **Write Scaling** | No (all writes go to primary) | Yes (writes distributed across shards) | Sharding when write traffic exceeds single DB capacity |
| **Read Scaling** | Yes (distribute reads across replicas) | Yes (each shard handles subset of reads) | Both scale reads; replicas simpler for read-only scaling |
| **Data Size** | All data on each replica | Data partitioned across shards | Sharding when data doesn't fit on single node |
| **Complexity** | Low (just replication setup) | High (partition key selection, rebalancing, cross-shard queries) | Replicas for simplicity; sharding when necessary for scale |
| **Consistency** | Replication lag (eventual consistency for reads) | Depends on implementation; can be strong per shard | Both have consistency tradeoffs |
| **Failure Impact** | Read capacity reduced; primary still handles writes | Shard unavailable affects subset of data | Replicas: graceful degradation; Sharding: partial outage |

**Why Choose Read Replicas:**
- Read:write ratio is 10:1 or higher (news sites, blogs, product catalogs)
- Need to offload reporting/analytics queries from primary
- Geographic distribution of read traffic
- Simple to implement and maintain

**Why Choose Sharding:**
- Write throughput exceeds single database capacity (high-frequency trading, IoT ingestion)
- Dataset size exceeds single server storage (multi-TB datasets)
- Need to isolate tenant data (multi-tenant SaaS)
- Combined with replicas for maximum scale

**Tradeoff Summary:**
- Replicas: Easy to implement + Read scalability ↔ No write scaling
- Sharding: Write + Read scalability + Large data ↔ High complexity, cross-shard queries difficult

---

### Normalization vs Denormalization

| Aspect | Normalization | Denormalization | When to Use |
|--------|--------------|----------------|-------------|
| **Data Redundancy** | Minimal (DRY principle) | High (data duplicated) | Normalize to save storage; denormalize for performance |
| **Write Performance** | Faster (single location update) | Slower (update multiple locations) | Normalize for write-heavy; denormalize for read-heavy |
| **Read Performance** | Slower (requires joins) | Faster (pre-joined data) | Denormalize for low-latency reads |
| **Data Integrity** | Easier (single source of truth) | Harder (risk of inconsistency) | Normalize for critical data accuracy |
| **Storage Cost** | Lower | Higher | Normalize when storage is expensive; denormalize when reads are expensive |
| **Use Case** | OLTP (transactional systems) | OLAP (analytics, reporting), NoSQL databases | |

**Why Choose Normalization:**
- Data integrity is critical (user accounts, financial records)
- Write-heavy workload (frequent updates to same entities)
- Storage costs are high
- Data changes frequently

**Why Choose Denormalization:**
- Read performance is critical (newsfeed, product search)
- Read:write ratio is very high
- Willing to sacrifice consistency for speed
- Pre-computed aggregations needed (dashboards, leaderboards)

**Tradeoff Summary:**
- Normalization: Data integrity + Storage efficiency ↔ Slow reads (joins)
- Denormalization: Fast reads ↔ Data redundancy + Update complexity

---

### Data Structures & Indexing Tradeoffs

| Structure | Strengths | Tradeoffs | When to Use |
|----------|-----------|-----------|-------------|
| **Bloom Filter** | Very space-efficient membership checks; O(k) inserts/queries; avoids expensive lookups | False positives; no value retrieval; hard deletes unless counting/quotient; needs sizing to meet FP rate | Prefiltering before DB/cache lookups, cache-penetration protection, existence checks at massive scale |
| **Redis Hash (Hash Map)** | Compact storage for many small fields; O(1) field access; atomic field updates | No per-field TTL; no secondary indexes or range queries; very large hashes can rehash and become memory-heavy | Grouping related attributes under one key (user profiles, counters, feature flags) |
| **Trie (Prefix Tree)** | Fast prefix search/autocomplete; lexicographic traversal; O(k) lookups | High memory overhead; pointer-heavy/cache-unfriendly; slower for random access vs hash | Prefix matching, autocomplete, routing tables, dictionary lookups |
| **B+ Tree** | Ordered index; efficient range scans; disk/page-friendly with high fanout | More complex writes (splits/merges); slower point lookups than hash; tuning page size and fill factor | Database indexes, range queries, ordered pagination, time-series by key |

**Why Choose Bloom Filter:**
- Minimize expensive DB hits for non-existent keys
- Protect caches from "thundering misses" or abuse
- Pre-check existence in distributed systems

**Why Choose Redis Hash:**
- Reduce key overhead vs many small keys
- Update fields atomically without rewriting whole object
- Keep related data co-located for cache locality

**Why Choose Trie:**
- Prefix search or autocomplete is core query
- Need ordered, lexicographic traversal
- Longest-prefix matching (routing, IPs)

**Why Choose B+ Tree:**
- Range queries, ordered scans, and pagination
- Disk-based storage where minimizing IO matters
- Multi-column indexes that benefit from ordering

**Tradeoff Summary:**
- Bloom Filter: Space-efficient existence checks ↔ False positives, no value retrieval
- Redis Hash: Memory efficiency + field-level updates ↔ No per-field TTL, no range queries
- Trie: Fast prefix queries ↔ High memory overhead
- B+ Tree: Range scans + ordered access ↔ More complex writes

---

## Caching Strategies

### Cache Aside vs Write-Through vs Write-Behind

| Strategy | How It Works | Pros | Cons | When to Use |
|----------|-------------|------|------|-------------|
| **Cache Aside (Lazy Loading)** | App checks cache first; on miss, loads from DB and populates cache | Simple; cache contains only requested data; resilient to cache failures | Initial request is slow (cache miss); stale data possible | Read-heavy with unpredictable access patterns (user profiles, product pages) |
| **Write-Through** | App writes to cache and DB synchronously | Cache always consistent with DB; read hits are fast | Write latency (two writes); wasted cache space for unread data | Read-heavy with critical consistency (inventory, pricing) |
| **Write-Behind (Write-Back)** | App writes to cache; cache asynchronously writes to DB | Fast writes; reduced DB load; batch writes possible | Risk of data loss if cache fails; eventual consistency | Write-heavy with acceptable data loss risk (analytics events, logs) |
| **Refresh-Ahead** | Cache proactively refreshes before expiration | Reduced latency; no cache miss penalty | Wasted resources if data not accessed; complex to implement | Predictable access patterns (homepage, trending content) |
https://media.licdn.com/dms/image/v2/D5622AQEElt9sWCpj7g/feedshare-shrink_1280/B56ZrkK72qJsAs-/0/1764764664024?e=1766620800&v=beta&t=q65MufpMjQ7-RPZnDg8E9EORftsJg-enbDdCWASdUhs
**Why Choose Each:**
- **Cache Aside**: Most flexible and common pattern; works when you don't know what to cache upfront
- **Write-Through**: Need strong consistency between cache and DB
- **Write-Behind**: Extremely high write throughput needed, can tolerate data loss
- **Refresh-Ahead**: Predictable access patterns, zero cache miss tolerance

**Tradeoff Summary:**
- Cache Aside: Flexibility + Resilience ↔ Cache misses, stale data
- Write-Through: Consistency ↔ Write latency
- Write-Behind: Write performance ↔ Data loss risk, complexity

---

## Storage Tradeoffs

### Object Storage vs Block Storage vs File Storage

| Aspect | Object Storage (S3) | Block Storage (EBS) | File Storage (EFS/NFS) | When to Use |
|--------|-------------------|-------------------|----------------------|-------------|
| **Access Pattern** | HTTP API (REST) | Direct block access | File system (POSIX) | Object: web/API; Block: DB; File: shared access |
| **Performance** | High throughput, moderate IOPS | Very high IOPS, low latency | Moderate throughput, good for concurrent access | Block for databases; Object for media; File for shared workloads |
| **Scalability** | Unlimited (horizontal) | Limited by volume size | Scales automatically (petabytes) | Object for massive scale; Block for single-instance; File for multi-instance |
| **Cost** | Lowest ($/GB) | Moderate to high | Moderate (higher than Object) | Object for archival; Block for performance; File for shared |
| **Use Cases** | Static assets, backups, data lakes | Databases, boot volumes | Shared code, content management | |

**Why Choose Object Storage:**
- Static website assets, backups, data lakes
- Cost-effective at massive scale
- Global distribution via CDN

**Why Choose Block Storage:**
- Database storage, high-IOPS applications
- Low-latency requirements

**Why Choose File Storage:**
- Shared access across multiple servers
- Content management systems, ML training data

**Tradeoff Summary:**
- Object: Unlimited scale + Low cost ↔ Higher latency
- Block: High performance ↔ Limited scale
- File: Shared access ↔ Higher cost

---

## Communication Patterns

### Synchronous vs Asynchronous

| Aspect | Synchronous (HTTP/gRPC) | Asynchronous (Message Queue) | When to Use |
|--------|------------------------|------------------------------|-------------|
| **Coupling** | Tight (caller waits) | Loose (fire and forget) | Sync: real-time; Async: decouple services |
| **Latency** | Low (immediate response) | Higher (eventual processing) | Sync: user-facing; Async: background jobs |
| **Reliability** | Retry in caller | Built-in retry, DLQ | Async for mission-critical tasks |
| **Scalability** | Limited (caller blocks) | High (queue absorbs spikes) | Async for traffic spikes |

**Why Choose Synchronous:**
- User needs immediate response (login, search)
- Simple request-response workflows
- Low latency critical

**Why Choose Asynchronous:**
- Long-running tasks (video transcoding)
- Decouple services for resilience
- Handle traffic spikes

**Tradeoff Summary:**
- Sync: Simple + Immediate ↔ Tight coupling
- Async: Decoupling + Scalability ↔ Complexity

### Client Updates: Short Polling vs Long Polling vs WebSockets vs Server-Sent Events (SSE)

| Aspect | Short Polling | Long Polling | WebSockets | SSE |
|--------|---------------|--------------|------------|-----|
| **Connection Model** | Client polls on interval (e.g., every 5s) | Client holds request open until data or timeout, then re-issues | Full-duplex persistent TCP (via HTTP upgrade) | One-way server → client over persistent HTTP |
| **Latency** | Interval-based; higher if interval large | Low; server responds immediately when data ready | Very low; bi-directional | Low; server pushes as events occur |
| **Server Load** | Many requests; wasted when nothing changes | Fewer requests; each may tie up a worker until data | Few connections; efficient after handshake | Few connections; efficient for push |
| **Scalability Pain** | High QPS, connection overhead | Thread/conn held per client; needs async IO | Many open sockets; needs load balancers/proxies that handle sticky/WS | Many open connections; similar infra to WS but simpler |
| **Use When** | Simple/low-traffic; no server push needed | Need near-real-time but infra limited to HTTP; moderate scale | Interactive, two-way updates (chat, games, collab) | Real-time, server-to-client only (tickers, notifications, logs) |
| **Drawbacks** | Wasted cycles, stale data between polls | Holding connections; timeouts; intermediate proxies can drop | More complex protocol, connection mgmt, backpressure | One-way only; older browsers need polyfills; retry/backoff handling |
| **Examples** | CRON-like dashboard refresh | Live score updates without WS/SSE support | Chat apps, multiplayer games, collaborative docs | Stock quotes, live comments, monitoring dashboards |

**How to choose:**
- Start with long polling if you need push-ish behavior but are limited to plain HTTP and modest scale.
- Use WebSockets for interactive, high-frequency bi-directional flows or when clients need to push frequently.
- Use SSE for server-to-client streaming where simplicity and HTTP semantics matter (auto-reconnect, events).
- Reserve short polling for low-QPS or legacy paths where real-time is not critical and change rate is low.

**Tradeoff Summary:**
- Short Polling: Easiest to add ↔ Latency + wasted requests at scale
- Long Polling: Near-real-time over HTTP ↔ Held connections, proxy timeouts
- WebSockets: Full-duplex + lowest latency ↔ Infra complexity (sticky sessions, scaling, backpressure)
- SSE: Simple server→client push ↔ One-way only, needs reconnect logic

### Chaos Engineering Levels (Netflix Playbook)

| Tool | What It Does | When to Use | Notes/Tradeoffs |
|------|--------------|-------------|-----------------|
| **Chaos Monkey** | Terminates random servers/instances | Every service; baseline resiliency validation | Catches single-instance brittleness; assumes stateless or fast reattach to state |
| **Chaos Gorilla** | Simulates losing an entire AZ | Critical systems where downtime hits revenue/reputation | Validates multi-AZ design, autoscaling, and failover runbooks |
| **Chaos Kong** | Simulates losing an entire region | Rare; only for global, highest-availability systems | Expensive to practice; requires active-active or warm standby cross-region |

**Context:** Netflix can run these because services are mostly stateless, globally aware, and designed for availability from day one (multi-AZ/region, retries, circuit breakers, resilient data stores).

**Practical guidance:**
- Monkey: default for all services; start here to harden base reliability.
- Gorilla: enable for revenue/brand-critical paths once multi-AZ is proven.
- Kong: usually overkill; reserve for globally distributed, tier-0 systems with cross-region architecture and clear blast-radius controls.

---

## Scalability Patterns

### Vertical vs Horizontal Scaling

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

## Consistency vs Availability

### CAP Theorem Tradeoffs

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

## API Design

### REST vs gRPC vs GraphQL vs WebSockets vs SSE vs WebHooks

| Aspect | REST | gRPC | GraphQL | WebSockets | SSE | WebHooks |
|--------|------|------|---------|-----------|-----|----------|
| **Protocol** | HTTP/1.1 or HTTP/2; JSON | HTTP/2; Protocol Buffers | HTTP/1.1 or HTTP/2; JSON query | HTTP/2 with WS upgrade; binary framing | HTTP/1.1 chunked stream | HTTP/1.1 POST callbacks |
| **Direction** | Request-response (client asks) | Request-response (client asks) | Request-response (client asks) | **Bi-directional** (client ↔ server) | **One-way push** (server → client) | **One-way push** (server → client) |
| **Payload Size** | Large (JSON verbose) | Small (binary protobuf) | Varies (only requested fields) | Small (binary framing) | Medium (text events) | Medium (JSON) |
| **Latency** | Moderate (text parsing) | Low (binary, multiplexing) | Moderate (parsing, resolving) | **Very low** (~ms, bidirectional) | **Low** (~ms, server→client) | N/A (async, eventual) |
| **Bandwidth** | High (verbose JSON) | Low (compact binary) | Medium (flexible selection) | Low (binary, efficient) | Medium (text, header overhead) | Medium |
| **Connection Model** | Stateless (request/response) | Stateless (request/response) | Stateless (request/response) | **Persistent, stateful** | **Persistent, stateful** | No connection (event-driven) |
| **Learning Curve** | Easy (HTTP verbs, JSON) | Moderate (protobuf, proto files) | Moderate-Hard (query language) | Moderate (WebSocket API, backpressure) | Easy (EventSource API) | Easy (HTTP POST) |
| **Caching** | Easy (HTTP caching, ETags) | Difficult (POST-based, binary) | Difficult (queries vary) | Difficult (stateful) | Difficult (streaming) | N/A (events) |
| **Browser Support** | Native | Requires gRPC-Web proxy | Native (via HTTP) | Native (most modern) | Native (most modern) | N/A (server-side) |
| **Flexibility** | Fixed endpoints (over/under-fetch) | Fixed schema (efficient) | **Highly flexible** (client specifies) | Flexible (custom messages) | Fixed event types | Event-based (no control) |
| **Streaming** | Not native (chunked transfer) | Bi-directional streaming | Subscriptions (separate WS/SSE) | **Full bi-directional** | **One-way server→client** | N/A |
| **Scalability** | Good (stateless, scales horizontally) | Good (stateless, scales well) | Good (stateless, query-dependent) | Complex (stateful, sticky sessions) | Excellent (stateless, HTTP-friendly) | Excellent (fire-and-forget) |
| **Error Handling** | HTTP status codes (200-5xx) | gRPC codes (granular) | Always 200; errors in body | Custom in message framing | No error feedback (one-way) | Implicit (no ack) |
| **Use When** | CRUD, public APIs, general web | Microservices, internal, high-throughput | Mobile clients, flexible schemas, multiple shapes | Chat, gaming, collaborative editing, real-time trading | Live dashboards, tickers, notifications, progress | Webhooks, async events, integrations |
| **Drawbacks** | Verbose; hard to cache; over/under-fetch | Complex setup; not browser-native; proto versioning | N+1 queries; expensive queries; caching hard | Stateful; sticky sessions; connection mgmt; proxy issues | One-way only; message size limits; no request-response | No guaranteed delivery; unidirectional; ordering issues |
| **Examples** | Stripe, GitHub REST, AWS | Kubernetes, Google Cloud internal, Etsy | GitHub GraphQL, Shopify, Slack | Slack, Discord, Figma, Google Docs | Stock tickers, live scores, monitoring dashboards | GitHub, Stripe, Twilio webhooks |

**Quick Decision Guide:**
- **REST**: Default for public/web APIs, CRUD-heavy, browser support, simple operations
- **gRPC**: Internal service-to-service, need low latency/bandwidth, polyglot microservices
- **GraphQL**: Mobile clients, flexible queries, complex nested data, multiple client types
- **WebSockets**: Interactive, bidirectional real-time (chat, gaming, collab editing, trading)
- **SSE**: Server push only, simple one-way updates (dashboards, notifications, tickers)
- **WebHooks**: Async event notifications, third-party integrations, fire-and-forget

---

### Detailed Tradeoffs: When to Use Each

#### **REST (Representational State Transfer)**

**Pros:**
- Simple, intuitive HTTP verbs (GET, POST, PUT, DELETE)
- Excellent browser support and debugging tools
- Native HTTP caching with ETags, cache headers
- Stateless; highly scalable
- Mature ecosystem and widespread adoption
- Easy API versioning (v1, v2 in URL)

**Cons:**
- Verbose JSON payloads; high bandwidth usage
- Over-fetching (unnecessary fields returned)
- Under-fetching (need multiple requests)
- Hard to evolve without breaking clients
- No fine-grained field selection
- Not ideal for complex, nested data relationships

**When to Use:**
- Public APIs for third-party developers (Stripe, AWS, GitHub REST API)
- Simple CRUD operations on resources
- High cache-hit scenarios (product catalogs, static content)
- Team expertise in REST; no special infrastructure
- Browser-based clients or mobile clients that benefit from HTTP standards

**Example:**
```
GET /api/users/123  → { id, name, email, createdAt, posts: [...] }  # Over-fetch
GET /api/users/123/posts  → Returns all post fields  # Under-fetch

# With REST, you either get all fields or need multiple endpoints
```

---

#### **gRPC (Google Remote Procedure Call)**

**Pros:**
- Binary Protocol Buffers: compact, fast serialization
- HTTP/2 multiplexing: multiple requests over one connection
- Bi-directional streaming (client→server, server→client)
- Strong typing via proto definitions
- Low latency and bandwidth (30% smaller than JSON)
- Service generation: auto-generate client/server stubs
- Built-in load balancing and service discovery

**Cons:**
- Not browser-native (requires gRPC-Web proxy)
- Steeper learning curve (Protocol Buffers, proto versioning)
- Binary payloads not human-readable; harder to debug
- HTTP/2 required (older infrastructure might struggle)
- Harder to cache than REST
- Overkill for simple, infrequent APIs
- Requires dedicated tooling and code generation

**When to Use:**
- Internal service-to-service communication (microservices)
- High-throughput, latency-sensitive systems (real-time, finance)
- Mobile apps needing bandwidth efficiency (2G/3G connections)
- Streaming requirements (file uploads, real-time updates)
- Organizations with polyglot microservices (language-agnostic)

**Example:**
```protobuf
// Proto definition
service UserService {
  rpc GetUser(UserId) returns (User);
  rpc StreamPosts(UserId) returns (stream Post);  // Server streams posts
  rpc UploadProfilePic(stream ImageChunk) returns (ProfileUrl);  // Client streams chunks
}

// Result: Type-safe, compact, multiplexed over HTTP/2
```

---

#### **GraphQL**

**Pros:**
- Client specifies exactly what fields needed; no over/under-fetch
- Single endpoint; no API versioning headaches
- Strong typing via schema; excellent IDE support
- Nested queries in single request (relationships)
- Self-documenting via introspection; built-in schema exploration
- Great for mobile clients with bandwidth constraints
- Easier API evolution (new fields without breaking old clients)

**Cons:**
- Resolver complexity (N+1 query problem if not careful)
- Query cost hard to predict (expensive queries possible)
- Caching is non-trivial (GET via query string vs POST)
- Large query payloads possible (more parsing overhead)
- Learning curve (schema design, resolvers, federation)
- Overkill for simple CRUD APIs
- Requires monitoring query depth/complexity to prevent abuse
- Subscription support needs separate WebSocket infrastructure

**When to Use:**
- Mobile/web clients needing flexible field selection
- Multiple clients with different data shape requirements (web, mobile, TV)
- Complex, highly-related data (social graphs, e-commerce product hierarchies)
- API that evolves frequently without breaking clients
- Reduce bandwidth for mobile apps

**Example:**
```graphql
# Client requests only needed fields
query {
  user(id: 123) {
    id
    name
    posts {
      id
      title
      comments {
        text
      }
    }
  }
}

# Fetches nested data in single request; only returns what's asked for
# No over-fetching unnecessary fields
```

---

#### **WebHooks**

**Pros:**
- Event-driven; server pushes to client (no polling)
- Asynchronous; doesn't block caller
- Simple HTTP POST; easy to debug
- Cost-efficient (no constant polling)
- Loosely coupled; client doesn't call server

**Cons:**
- No guaranteed delivery (need retry + DLQ pattern)
- Unidirectional (server→client only; client can't query server)
- Ordering not guaranteed (events may arrive out-of-order)
- Complex retry/backoff logic needed
- Caller can't get historical events (no playback)
- Requires client to have public URL (NAT, firewall issues)
- Duplicate handling needed (at-least-once delivery)

**When to Use:**
- Event notifications (payment processed, order shipped, deployment complete)
- Third-party integrations (GitHub, Stripe, Slack)
- Real-time updates without constant polling
- Asynchronous processing (trigger background jobs)

**Example:**
```
Stripe sends webhook POST to https://myapp.com/webhooks/stripe
{
  "type": "charge.succeeded",
  "data": {
    "object": {
      "id": "ch_123",
      "amount": 2000,
      "currency": "usd"
    }
  }
}

# App processes event, acknowledges with 200 OK
# Stripe retries if no 200 response
```

---

### WebSockets vs Server-Sent Events (SSE)

| Aspect | WebSockets | SSE (Server-Sent Events) | When to Use |
|--------|-----------|------------------------|-------------|
| **Direction** | Bi-directional (client ↔ server) | One-way (server → client) | WebSockets: interactive; SSE: notifications |
| **Connection Type** | Full-duplex persistent TCP (HTTP upgrade) | One-way persistent HTTP | WebSockets: chat/gaming; SSE: streaming updates |
| **Latency** | Very low (~ms) | Low (~ms, but one-way) | Both excellent for real-time |
| **Protocol** | Custom binary framing after HTTP upgrade | Plain HTTP with chunked transfer | WebSockets for low-latency; SSE for simplicity |
| **Browser Support** | Native (modern browsers) | Native (most modern browsers) | Both have good support |
| **Fallback** | Requires custom polyfill (long-polling) | Auto-reconnect, built-in retry | SSE has better fallback semantics |
| **Bandwidth** | Low (binary framing, multiplexing) | Medium (text events, headers repeated) | WebSockets more efficient |
| **Scalability** | More connections; stateful session | Fewer resources; HTTP-friendly | SSE scales better with many clients |
| **Proxy/LB Compat** | Needs sticky sessions, WS-aware proxies | Works with standard HTTP load balancers | SSE better for cloud/CDN deployment |
| **Use When** | Chat, collaborative editing, multiplayer games, real-time trading | Live dashboards, notifications, live feeds, progress tracking | |
| **Drawbacks** | Stateful; complex backpressure; sticky sessions; old proxies drop connections | One-way only (client can't stream to server); message size limits on some servers; no native request-response | |
| **Examples** | Slack, Discord, Google Docs collab, Twitch chat | Stock price tickers, live sports scores, GitHub live feeds, Sentry error notifications | |

---

#### **WebSockets Deep Dive**

**Pros:**
- True bi-directional communication (client ↔ server, simultaneously)
- Very low latency; minimal overhead after handshake
- Binary framing; efficient protocol
- Ideal for interactive, high-frequency updates (chat, gaming, collaborative editing)
- Single persistent connection; reduces connection overhead vs long-polling
- Built-in ping/pong keepalive

**Cons:**
- Stateful connections; harder to scale (sticky sessions, in-memory state)
- Requires WS-aware load balancers/proxies; older infrastructure may drop connections
- Complex backpressure handling; no built-in flow control
- Manual reconnect logic and state sync on disconnect
- Memory overhead per connection (not suitable for millions of idle connections)
- Harder to debug (binary protocol, custom framing)
- Requires separate port/endpoint configuration

**When to Use:**
- Real-time collaborative applications (Google Docs, Figma, Miro)
- Chat and messaging systems (Slack, Discord, WhatsApp Web)
- Multiplayer games (Fortnite, Valorant—not turn-based)
- Live trading/financial platforms (stock prices, forex)
- Real-time notifications requiring bidirectional interaction
- High-frequency, low-latency requirements

**Example:**
```javascript
// Client
const ws = new WebSocket('wss://api.example.com/ws');
ws.onmessage = (event) => {
  console.log('Server says:', event.data);
};
ws.send(JSON.stringify({ action: 'move', x: 100, y: 200 })); // Client→Server

// Server sends back immediately
ws.onmessage = (event) => {
  // Other players' movements, game state, etc.
  const message = JSON.parse(event.data);
  updateGameState(message);
};
```

---

#### **Server-Sent Events (SSE) Deep Dive**

**Pros:**
- Simpler than WebSockets; uses standard HTTP
- Built-in reconnect mechanism with exponential backoff
- Works with standard HTTP load balancers; no sticky sessions needed
- Lower memory overhead per connection (HTTP semantics)
- Works through CDNs and proxies seamlessly
- Text-based; easy to debug (plain HTTP stream)
- Event IDs and retry semantics built-in
- Perfect for unidirectional server→client streaming

**Cons:**
- One-way only; client cannot stream to server (need separate channel)
- Text-based payload; less efficient than binary WebSocket framing
- HTTP header overhead on each message (in some implementations)
- Limited message size on some servers
- Older browsers need polyfill
- Per-connection memory still grows with concurrent clients (but less than WS)
- Not ideal for request-response patterns

**When to Use:**
- Live dashboards and monitoring (real-time metrics, system status)
- Notifications (GitHub deployments, Stripe webhooks as server pushes)
- Live feeds (Twitter live tweets, news tickers)
- Progress tracking (video transcoding, long-running jobs)
- Server → browser notifications (system alerts, real-time updates)
- Scenarios where client rarely needs to send data

**Example:**
```javascript
// Client
const eventSource = new EventSource('/api/live/scores');
eventSource.addEventListener('score-update', (e) => {
  const data = JSON.parse(e.data);
  console.log(`Goal! ${data.team}: ${data.score}`);
});

eventSource.addEventListener('game-over', (e) => {
  console.log('Final score:', e.data);
  eventSource.close();
});

// Server (Node.js)
app.get('/api/live/scores', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send initial connection
  res.write('retry: 10000\n\n');
  
  // Stream events
  const interval = setInterval(() => {
    const score = getLatestScore();
    res.write(`id: ${score.id}\n`);
    res.write(`event: score-update\n`);
    res.write(`data: ${JSON.stringify(score)}\n\n`);
  }, 1000);
  
  req.on('close', () => clearInterval(interval));
});
```

---

### Real-Time API Pattern Comparison Summary

| Scenario | Best Choice | Why |
|----------|------------|-----|
| Chat application | WebSocket | Bidirectional, low latency, always connected |
| Live stock ticker | SSE | Server→client only, simpler, load balancer friendly |
| Collaborative document editing | WebSocket | Bidirectional edits, conflict resolution, low latency |
| Live sports scores | SSE | One-way push, no client input, high client count |
| Multiplayer game | WebSocket | Bidirectional, precise timing, state sync |
| System monitoring dashboard | SSE | Metrics pushed from server, no client control needed |
| Real-time notifications | SSE or WebSocket | SSE if no response; WebSocket if acknowledge/interact |
| Video call (WebRTC) | WebSocket (signaling) | WebSocket for SDP/ICE exchange; RTC for media |

---

### Other API Patterns

| Pattern | Use Case | Tradeoff |
|---------|----------|----------|
| **SOAP** | Legacy enterprise systems (banking, insurance) | Verbose XML; complex WS-* standards; heavyweight |
| **Query Languages (SQL, Cypher)** | Database-as-a-Service, analytics APIs | Exposes DB; security risk; hard to control complexity |
| **File Upload APIs** | Large file uploads, multipart streaming | Chunk management; resume handling; bandwidth |
| **Matrix (event-driven, federation)** | Real-time collaboration, distributed messaging | Complex state sync; higher latency than direct DB access |

---

### API Selection Flowchart

```
1. Is it internal service-to-service?
   YES → gRPC (low latency, bandwidth, streaming)
   NO → Go to 2

2. Do clients need flexible field selection?
   YES → GraphQL (mobile, multiple client types)
   NO → Go to 3

3. Do you need real-time push from server?
   YES → WebHooks or WebSockets + REST
   NO → Go to 4

4. Is it a public/third-party API?
   YES → REST (familiarity, caching, browser support)
   NO → Can use gRPC internally

5. Is this a legacy/enterprise system?
   YES → Consider SOAP (if already in ecosystem)
   NO → Go with REST, gRPC, or GraphQL
```

---

## Data Processing

### Batch vs Stream Processing

| Aspect | Batch | Stream | When to Use |
|--------|-------|--------|-------------|
| **Latency** | High (hours) | Low (milliseconds) | Batch: reports; Stream: real-time |
| **Volume** | Large | Small (per record) | Batch: historical; Stream: live |
| **Complexity** | Simpler | Complex | Batch for simplicity |
| **Cost** | Lower | Higher | Batch for cost-sensitive |

**Why Choose Batch:**
- Daily reports, ML training, ETL jobs
- Cost-effective for non-time-sensitive

**Why Choose Stream:**
- Real-time fraud detection, live dashboards
- Event-driven architectures

**Tradeoff Summary:**
- Batch: Cost-effective ↔ High latency
- Stream: Low latency ↔ Higher cost, complexity

---

## Architecture Patterns

### Monolith vs Microservices

| Aspect | Monolith | Microservices | When to Use |
|--------|---------|--------------|-------------|
| **Deployment** | Single unit | Multiple services | Monolith: startups; Microservices: mature |
| **Scalability** | Scale entire app | Scale independently | Microservices: heterogeneous scaling |
| **Development** | Simple | Complex | Monolith: small teams |
| **Fault Isolation** | Entire app | Service-level | Microservices: resilience |

**Why Choose Monolith:**
- Early-stage startup, small team, simple domain

**Why Choose Microservices:**
- Large org, distinct domains, team autonomy

**Tradeoff Summary:**
- Monolith: Simplicity ↔ Limited scalability
- Microservices: Independent scaling ↔ Complexity

---

## Summary: Decision Framework

When faced with tradeoffs:

1. **Non-functional requirements**: Latency, throughput, availability, consistency
2. **Read:write ratio**: Affects caching, replication, sharding decisions
3. **Data access patterns**: Determines DB choice (SQL vs NoSQL)
4. **Team size/expertise**: Influences architecture complexity
5. **Cost constraints**: Impacts infrastructure choices
6. **Failure tolerance**: Determines redundancy and consistency levels

**Remember**: Every architecture decision is a tradeoff. Choose based on your specific requirements, constraints, and priorities.
