# Elasticsearch - Complete Deep Dive

## What is Elasticsearch?

**Elasticsearch** is a distributed search and analytics engine built on top of Apache Lucene that enables:
- **Full-text search**: Index and search large volumes of data
- **Real-time analytics**: Aggregate and visualize data instantly
- **Distributed storage**: Horizontal scaling across multiple nodes
- **High availability**: Automatic replication and failover
- **Flexible querying**: Complex boolean queries, fuzzy search, range queries

### Core Characteristics

| Aspect | Benefit |
|--------|---------|
| **Distributed** | Horizontal scaling across nodes/clusters |
| **Fault-tolerant** | Automatic replica placement and recovery |
| **Real-time** | Sub-100ms search latency on large datasets |
| **Schemaless** | Dynamic field mapping (flexible structure) |
| **Horizontally scalable** | Add nodes to increase throughput/storage |
| **Full-text search** | Advanced tokenization, stemming, analyzers |

---

## Elasticsearch Architecture Overview

<details>
<summary>Click to view code</summary>

```
Clients (HTTP/TCP)
       ↓
   [Elasticsearch Cluster]
       ├─ Node 1 (Data + Master eligible)
       ├─ Node 2 (Data + Master eligible)
       ├─ Node 3 (Data + Master eligible)
       └─ Coordinator Node (routes requests)
       ↓
   [Indices] → [Shards] → [Documents]
       ↓
   [Lucene indexes]
```

</details>

**Key layers:**
- **Cluster**: Collection of nodes working together
- **Node**: Single Elasticsearch instance
- **Index**: Like a database table, holds documents
- **Shard**: Partition of an index (enables parallelism)
- **Replica**: Copy of a shard for redundancy
- **Document**: JSON object, basic unit of data

---

## Core Components

### 1. Clusters and Nodes

**Cluster**: Logical grouping of one or more Elasticsearch nodes

<details>
<summary>Click to view code</summary>

```
Production Cluster Setup:

Master nodes (3):
  - Elect cluster leader
  - Manage cluster state
  - No data stored
  - Lightweight, high availability

Data nodes (N):
  - Store indices and shards
  - Execute search/index operations
  - Resource intensive (disk, CPU, RAM)

Coordinator nodes (optional):
  - Route requests to data nodes
  - Reduce load on master nodes
  - No data stored
```

</details>

**Node roles:**
<details>
<summary>Click to view code (yaml)</summary>

```yaml
# Master-eligible node
node.roles: [master, data]

# Data-only node
node.roles: [data]

# Coordinator node (ingest + voting only)
node.roles: [ingest]
```

</details>

---

### 2. Indices and Shards

**Index**: Similar to a database table; stores documents

<details>
<summary>Click to view code</summary>

```
Index: products
  ├─ Shard 0 (Primary) → Replica 0
  │   Docs: 100K
  │   Size: 500MB
  │
  ├─ Shard 1 (Primary) → Replica 1
  │   Docs: 100K
  │   Size: 500MB
  │
  └─ Shard 2 (Primary) → Replica 2
      Docs: 100K
      Size: 500MB
```

</details>

**Shard**: Partition of an index (enables parallel processing)

<details>
<summary>Click to view code</summary>

```
Why shards?
- Parallelism: Multiple shards can be searched simultaneously
- Throughput: Spread writes across shards
- Storage: Each shard is a complete Lucene index
- Distribution: Shards spread across nodes for load balancing

Shard placement strategy:
- Primary shards: Distributed round-robin across nodes
- Replicas: Placed on different nodes than primary
- Example: 5 shards × 2 replicas = 15 total shard copies

Index settings:
{
  "settings": {
    "number_of_shards": 5,    # Initial shards (can't change)
    "number_of_replicas": 2    # Replicas (can be changed)
  }
}
```

</details>

**Replica**: Copy of a shard for redundancy

<details>
<summary>Click to view code</summary>

```
Benefits:
- HA: If primary shard lost, replica promoted to primary
- Search parallelism: Searches hit both primary + replicas
- Read scalability: More replicas = more parallel reads

Trade-offs:
- Disk space: 2 replicas = 3x storage usage
- Network I/O: Replication introduces latency
- Indexing latency: Must replicate to all replicas
```

</details>

---

### 3. Documents and Mappings

**Document**: JSON object indexed in Elasticsearch

<details>
<summary>Click to view code (json)</summary>

```json
{
  "_index": "products",
  "_id": "12345",
  "_type": "_doc",
  "_version": 1,
  "_score": 2.5,
  "_source": {
    "title": "Laptop",
    "price": 999.99,
    "category": "Electronics",
    "tags": ["computer", "portable"],
    "created_at": "2024-01-05T10:00:00Z"
  }
}
```

</details>

**Mapping**: Schema definition for an index

<details>
<summary>Click to view code (json)</summary>

```json
{
  "mappings": {
    "properties": {
      "title": {
        "type": "text",
        "analyzer": "standard"
      },
      "price": {
        "type": "float"
      },
      "category": {
        "type": "keyword"
      },
      "tags": {
        "type": "keyword"
      },
      "created_at": {
        "type": "date",
        "format": "strict_date_time"
      }
    }
  }
}
```

</details>

**Field types:**

| Type | Use Case | Searchable | Sortable |
|------|----------|-----------|----------|
| **text** | Full-text search (title, description) | Yes (analyzed) | No |
| **keyword** | Exact match, filtering (category, status) | Yes (not analyzed) | Yes |
| **integer/float** | Numbers (price, quantity) | Yes | Yes |
| **date** | Timestamps | Yes | Yes |
| **nested** | Array of objects (comments, reviews) | Yes | Limited |
| **geo_point** | Latitude/longitude | Yes (geo queries) | Yes |

---

### 4. Inverted Index (Core of Lucene)

**Inverted Index**: Maps terms → documents (enables fast search)

<details>
<summary>Click to view code</summary>

```
Documents:
Doc 1: "Elasticsearch is powerful"
Doc 2: "Elasticsearch is fast"
Doc 3: "Fast search engine"

Inverted Index:
elasticsearch → [Doc1, Doc2]
is → [Doc1, Doc2]
powerful → [Doc1]
fast → [Doc2, Doc3]
search → [Doc3]
engine → [Doc3]

Query: "fast"
  1. Look up "fast" in index → [Doc2, Doc3]
  2. Return matches instantly
```

</details>

**Analysis process** (converts text → searchable terms):

<details>
<summary>Click to view code</summary>

```
Input: "The Quick Brown Fox"
    ↓
1. Tokenizer: ["The", "Quick", "Brown", "Fox"]
    ↓
2. Token Filters:
   - Lowercase: ["the", "quick", "brown", "fox"]
   - Remove stopwords: ["quick", "brown", "fox"]
    ↓
3. Store in inverted index:
   quick → [Doc]
   brown → [Doc]
   fox → [Doc]
```

</details>

---

## Indexing (Writes)

### Indexing Flow

<details>
<summary>Click to view code</summary>

```
Client:
  PUT /products/_doc/12345
  { "title": "Laptop", "price": 999 }
       ↓
Primary Shard:
  1. Parse JSON
  2. Analyze fields
  3. Build inverted index
  4. Store in memory buffer (refresh)
       ↓
Replica Shards:
  Receive and index same document
       ↓
Acknowledgment:
  Return success to client
```

</details>

### Indexing Settings

<details>
<summary>Click to view code (python)</summary>

```python
# Bulk indexing for high throughput
from elasticsearch import Elasticsearch

es = Elasticsearch(['localhost:9200'])

# Bulk index documents
actions = [
    {"index": {"_index": "products", "_id": i}},
    {"title": f"Product {i}", "price": i * 10}
    for i in range(10000)
]

from elasticsearch.helpers import bulk
bulk(es, actions, chunk_size=500)
```

</details>

**Refresh and flush:**

<details>
<summary>Click to view code</summary>

```
Refresh (every 1 second by default):
  - Flushes buffer to Lucene segment
  - Makes documents searchable
  - No durability guarantee

Flush:
  - Commits Lucene segment to disk
  - Updates transaction log
  - Ensures durability

Optimization:
  - Bulk indexing: Increase refresh_interval during bulk operations
  - Disable replicas: Index to primary only, then enable replicas
  - Bulk size: 5-15MB chunks for optimal performance
```

</details>

---

## Searching (Reads)

### Query Types

**Match Query** (full-text, analyzed):
<details>
<summary>Click to view code (json)</summary>

```json
{
  "query": {
    "match": {
      "title": "fast search"
    }
  }
}
// Matches: "fast", "search", "faster", "searched" (due to analysis)
```

</details>

**Term Query** (exact match, not analyzed):
<details>
<summary>Click to view code (json)</summary>

```json
{
  "query": {
    "term": {
      "status": "active"
    }
  }
}
// Exact match only
```

</details>

**Bool Query** (combine conditions):
<details>
<summary>Click to view code (json)</summary>

```json
{
  "query": {
    "bool": {
      "must": [
        {"match": {"title": "laptop"}},
        {"range": {"price": {"gte": 500, "lte": 1500}}}
      ],
      "filter": [
        {"term": {"in_stock": true}}
      ],
      "should": [
        {"match": {"tags": "gaming"}}
      ]
    }
  }
}
```

</details>

**Filter Context** (cached, fast):
<details>
<summary>Click to view code (json)</summary>

```json
{
  "query": {
    "bool": {
      "filter": [
        {"term": {"status": "active"}},
        {"range": {"created_at": {"gte": "2024-01-01"}}}
      ]
    }
  }
}
// Filters are cached and don't affect scoring
```

</details>

---

### Search Execution Flow

<details>
<summary>Click to view code</summary>

```
Query:
  bool {
    must: [match: "laptop", range: price 500-1500],
    filter: [term: in_stock=true]
  }
       ↓
1. Query Phase (find matching shards):
   - All shards execute query
   - Return top 10 doc IDs + scores
   - Coordinator gathers results
       ↓
2. Fetch Phase (get documents):
   - Coordinator fetches full documents
   - Apply sorting/pagination
   - Return to client
```

</details>

**Query DSL Examples:**

<details>
<summary>Click to view code (python)</summary>

```python
# Python client
es = Elasticsearch(['localhost:9200'])

# Full-text search
results = es.search(index="products", body={
    "query": {
        "match": {
            "title": "laptop"
        }
    },
    "size": 10
})

# Filter + aggregation
results = es.search(index="products", body={
    "query": {
        "bool": {
            "filter": [
                {"term": {"in_stock": True}},
                {"range": {"price": {"gte": 500}}}
            ]
        }
    },
    "aggs": {
        "avg_price": {"avg": {"field": "price"}},
        "categories": {
            "terms": {"field": "category", "size": 10}
        }
    }
})
```

</details>

---

## Aggregations (Analytics)

**Aggregations**: Group and analyze data without searching

<details>
<summary>Click to view code (json)</summary>

```json
{
  "aggs": {
    "price_ranges": {
      "range": {
        "field": "price",
        "ranges": [
          {"to": 500},
          {"from": 500, "to": 1000},
          {"from": 1000}
        ]
      }
    },
    "by_category": {
      "terms": {
        "field": "category",
        "size": 10
      },
      "aggs": {
        "avg_price": {"avg": {"field": "price"}}
      }
    }
  }
}
```

</details>

**Common aggregation types:**

| Aggregation | Use Case | Example |
|-------------|----------|---------|
| **terms** | Count occurrences | Top 10 products by sales |
| **avg/sum/max/min** | Statistical | Average price per category |
| **date_histogram** | Time-series | Sales per day |
| **percentiles** | Distribution | P99 latency |
| **cardinality** | Unique count | Unique users |

---

## Performance Optimization

### Indexing Optimization

<details>
<summary>Click to view code (properties)</summary>

```properties
# During bulk indexing
index.refresh_interval=-1          # Disable auto-refresh
index.number_of_replicas=0         # No replication

# Bulk indexing settings
bootstrap.mlockall=true            # Lock memory (no swap)
indices.memory.index_buffer_size=30%  # Larger buffer

# Rebalance shards after bulk indexing
index.number_of_replicas=2

# Force merge segments
POST /index/_forcemerge?max_num_segments=1
```

</details>

### Search Optimization

<details>
<summary>Click to view code (properties)</summary>

```properties
# Field caching for frequent filters
index.fielddata.cache.size=20%

# Shard allocation awareness
cluster.routing.allocation.awareness.attributes=zone
node.attr.zone=us-west-1a

# Query cache (filters)
index.queries.cache.is_enabled=true

# Request cache (aggregations)
indices.requests.cache.size=1%
```

</details>

### Resource Configuration

<details>
<summary>Click to view code (properties)</summary>

```properties
# Memory allocation
-Xms8g -Xmx8g  # Heap size (half of total system RAM)

# File descriptors
ulimit -n 65535

# Virtual memory
vm.max_map_count=262144

# Network
http.port=9200
transport.port=9300
network.host=0.0.0.0
```

</details>

---

## Scalability & High Availability

### Cluster Architecture

**Small cluster** (1-10 nodes):
<details>
<summary>Click to view code</summary>

```
3 Master-eligible nodes
+ 5 Data nodes
= 8 total nodes
Handles: 1-10M docs/day
```

</details>

**Medium cluster** (10-50 nodes):
<details>
<summary>Click to view code</summary>

```
3-5 Master nodes
+ 20-40 Data nodes
+ Coordinator nodes (optional)
Handles: 100M-1B docs/day
```

</details>

**Large cluster** (50+ nodes):
<details>
<summary>Click to view code</summary>

```
5 Master nodes (separate from data)
+ 100+ Data nodes
+ 10+ Coordinator nodes
+ Dedicated ingest nodes (optional)
Handles: 1B+ docs/day
```

</details>

### Replica Strategy

<details>
<summary>Click to view code</summary>

```
Trade-off: Availability vs Resource Cost

0 Replicas:
  - Failure = data loss
  - Lowest cost
  - Fast indexing
  - Use for: Testing, non-critical data

1 Replica:
  - Failure = one node down, data preserved
  - Can lose one node
  - Balanced cost/availability
  - Use for: Production with SLA

2+ Replicas:
  - Failure = multiple nodes can go down
  - Higher cost (3x storage with 2 replicas)
  - Excellent read parallelism
  - Use for: Critical, high-traffic systems
```

</details>

### Cross-Cluster Replication

<details>
<summary>Click to view code</summary>

```
Primary Cluster (US-East):
  [Index A] → Replicates → Secondary Cluster (EU-West)
                              [Index A Mirror]

Use case: Geographic redundancy, disaster recovery

Configuration:
- CCR (Cross-Cluster Replication)
- Bidirectional replication for active-active
- One-way for active-passive DR
```

</details>

---

## Configuration Tuning

### Discovery and Cluster Formation

<details>
<summary>Click to view code (properties)</summary>

```properties
# Cluster name
cluster.name=my-cluster

# Master nodes
discovery.seed_hosts=["node1", "node2", "node3"]
cluster.initial_master_nodes=["node1", "node2", "node3"]

# Split-brain prevention
discovery.zen.minimum_master_nodes=2  # (N/2 + 1)

# Shard allocation
cluster.routing.allocation.enable=all
```

</details>

### Index Configuration

<details>
<summary>Click to view code (json)</summary>

```json
{
  "settings": {
    "number_of_shards": 10,
    "number_of_replicas": 2,
    "index.codec": "best_compression",
    "index.refresh_interval": "30s",
    "index.store.type": "niofs"
  }
}
```

</details>

### Shard Size Guidelines

<details>
<summary>Click to view code</summary>

```
Target shard size: 20-50 GB (per replica)

Calculation:
  Total index size: 1 TB
  Desired shard size: 30 GB
  Number of shards needed: 1TB / 30GB ≈ 34 shards

Too few shards:
  - Few parallel searches
  - Slow recovery
  - Unbalanced load

Too many shards:
  - Overhead from coordination
  - Slow recovery (many shards to rebuild)
  - Per-shard memory overhead
```

</details>

---

## Use Cases

### 1. Full-Text Search

<details>
<summary>Click to view code</summary>

```
E-commerce search:
  - Product catalog search
  - Faceted search (filter by category, price range)
  - Autocomplete/typeahead
  - Search-as-you-type
```

</details>

### 2. Logging and Metrics (ELK Stack)

<details>
<summary>Click to view code</summary>

```
Elasticsearch + Logstash + Kibana:
  - Collect logs from servers
  - Parse and enrich with Logstash
  - Index in Elasticsearch
  - Visualize in Kibana

Benefits:
  - Real-time log analysis
  - Pattern detection
  - Performance monitoring
```

</details>

### 3. Analytics and BI

<details>
<summary>Click to view code</summary>

```
Time-series analytics:
  - Event data (clicks, page views, purchases)
  - Metrics (CPU, memory, request latency)
  - Aggregations for dashboards
  - Ad-hoc analysis
```

</details>

### 4. Geospatial Search

<details>
<summary>Click to view code</summary>

```
Map-based services:
  - "Find restaurants near me"
  - Ride-sharing (nearby drivers)
  - Delivery services (nearest warehouse)

Geo query types:
  - geo_distance: Radius search
  - geo_bounding_box: Area search
  - geo_polygon: Complex boundaries
```

</details>

---

## Interview Questions & Answers

### Q1: Design a search system for an e-commerce platform (10M products, 10K QPS)

**Requirements:**
- Fast product search (< 100ms)
- Faceted search (filter by category, price, ratings)
- Autocomplete suggestions
- 99.99% uptime

**Solution Architecture:**

<details>
<summary>Click to view code</summary>

```
Cluster Setup:
  - 3 Master nodes (t3.medium)
  - 20 Data nodes (r5.4xlarge: 128GB RAM, high memory)
  - Coordinator nodes (optional, for high load)

Index Design:
  "products" index
    - Shards: 20 (1 per data node for parallelism)
    - Replicas: 2 (3x total copies for HA)
    - Mapping:
      {
        "product_id": keyword,
        "title": text (analyzer: standard + stemmer),
        "description": text,
        "category": keyword,
        "price": float,
        "rating": float,
        "in_stock": boolean,
        "created_at": date
      }
```

</details>

**Query optimization:**

<details>
<summary>Click to view code (python)</summary>

```python
# Faceted search with aggregations
query = {
    "query": {
        "bool": {
            "must": [
                {"match": {"title": user_input}}
            ],
            "filter": [
                {"term": {"category": selected_category}},
                {"range": {"price": {"gte": min_price, "lte": max_price}}},
                {"term": {"in_stock": True}}
            ]
        }
    },
    "aggs": {
        "categories": {"terms": {"field": "category", "size": 50}},
        "price_ranges": {
            "range": {
                "field": "price",
                "ranges": [{"to": 100}, {"from": 100, "to": 500}, ...]
            }
        },
        "ratings": {"terms": {"field": "rating", "size": 5}}
    },
    "size": 20,
    "from": 0
}
```

</details>

**Autocomplete:**

<details>
<summary>Click to view code (json)</summary>

```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "stop", "snowball"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "product_title": {
        "type": "text",
        "analyzer": "autocomplete_analyzer",
        "fields": {
          "suggest": {
            "type": "completion"
          }
        }
      }
    }
  }
}

// Query autocomplete
{
  "query": {
    "match_phrase_prefix": {
      "product_title": "lapt"
    }
  },
  "size": 10
}
```

</details>

**Performance expectations:**

| Operation | Latency | Notes |
|-----------|---------|-------|
| Search | 50-100ms | P99 with 20 shards parallel |
| Faceted search | 100-200ms | Aggregations take longer |
| Autocomplete | 10-50ms | Completion suggester cached |

---

### Q2: Cluster goes down. How to recover without data loss?

**Answer:**

**Backup strategy:**

<details>
<summary>Click to view code (properties)</summary>

```properties
# Snapshot repository (S3)
PUT /_snapshot/s3-backup
{
  "type": "s3",
  "settings": {
    "bucket": "my-es-backups",
    "region": "us-east-1"
  }
}

# Take snapshot daily
POST /_snapshot/s3-backup/snapshot-2024-01-05?wait_for_completion=true
```

</details>

**Recovery scenarios:**

| Failure | Impact | Recovery Time |
|---------|--------|---|
| **1 Data node fails** | No impact (replicas take over) | Automatic (seconds) |
| **Multiple nodes fail** | Replicas insufficient | Minutes (depends on replica count) |
| **Entire cluster down** | Data recoverable from snapshot | 30min-2hrs (restore from S3) |

**Recovery procedure:**

<details>
<summary>Click to view code (bash)</summary>

```bash
# 1. Restore cluster from backup
POST /_snapshot/s3-backup/snapshot-2024-01-05/_restore
{
  "indices": "products,users",
  "ignore_unavailable": true
}

# 2. Monitor recovery status
GET /_recovery

# 3. Verify data integrity
GET /products/_count

# 4. Resync replicas
PUT /products/_settings
{
  "index.number_of_replicas": 2
}
```

</details>

**Key takeaway**: "With 2+ replicas, node failure is automatic failover. For total cluster failure, restore from snapshots (RPO = 1 day if daily snapshots)."

---

### Q3: Search latency spike. How to diagnose?

**Answer:**

**Diagnosis checklist:**

<details>
<summary>Click to view code (bash)</summary>

```bash
# 1. Check cluster health
GET /_cluster/health

# 2. Check shard allocation
GET /_cat/shards?v

# 3. Check node stats (CPU, memory, GC)
GET /_nodes/stats

# 4. Check slowlog
GET /products/_settings?include_defaults=true | grep slowlog

# 5. Enable slowlog for 1 second queries
PUT /products/_settings
{
  "index.search.slowlog.threshold.query.warn": "1s"
}

# 6. Check pending tasks
GET /_cluster/pending_tasks

# 7. Monitor JVM GC
GET /_nodes/jvm/stats
```

</details>

**Common causes and fixes:**

| Problem | Cause | Fix |
|---------|-------|-----|
| **High query latency** | Large result set (slow fetch phase) | Reduce page size, use scroll API |
| **GC pauses** | Heap too full, frequent GC | Increase heap, optimize query |
| **Unbalanced shards** | Hot shards (too much traffic) | Rebalance shards, adjust routing |
| **Slow aggregations** | Too many buckets | Reduce aggregation cardinality |
| **Disk I/O bottleneck** | SSD at capacity | Add nodes, optimize refresh interval |

---

### Q4: Index size growing 10x in 3 months. How to optimize storage?

**Answer:**

**Root cause analysis:**

<details>
<summary>Click to view code (bash)</summary>

```bash
# Check index size
GET /_cat/indices?v&h=index,store.size,docs.count

# Calculate docs per GB
docs_per_gb = docs.count / (store.size / 1GB)
```

</details>

**Optimization strategies:**

1. **Compression:**
<details>
<summary>Click to view code (json)</summary>

```json
{
  "settings": {
    "index.codec": "best_compression"  // vs default
  }
}
```

</details>

2. **Disable unnecessary fields:**
<details>
<summary>Click to view code (json)</summary>

```json
{
  "mappings": {
    "properties": {
      "description": {
        "type": "text",
        "index": false  // Don't index, just store
      }
    }
  }
}
```

</details>

3. **Field type optimization:**
<details>
<summary>Click to view code</summary>

```
text field: 2x size of keyword field
nested objects: High overhead
Use keyword where full-text search not needed
```

</details>

4. **Index lifecycle management:**
<details>
<summary>Click to view code</summary>

```
Hot: Current month (full replicas, high refresh rate)
Warm: Last 3 months (fewer replicas, lower refresh rate)
Cold: Older data (minimal replicas, snapshot only)
Delete: > 1 year
```

</details>

**Expected improvements:**

<details>
<summary>Click to view code</summary>

```
Before optimization:
  1M docs = 10GB storage (10KB per doc average)

After compression + field optimization:
  1M docs = 5GB storage (50% reduction)

With tiering:
  1M docs = 3GB total (hot: 1GB, warm: 1.5GB, cold: 0.5GB)
```

</details>

---

### Q5: Designing Elasticsearch for real-time log aggregation (1M logs/sec)

**Answer:**

**Architecture:**

<details>
<summary>Click to view code</summary>

```
Log Sources (servers, apps)
       ↓
Logstash (parsing, enrichment)
       ↓
Elasticsearch Cluster (hot-warm-cold)
       ↓
Kibana (visualization)
```

</details>

**Cluster sizing:**

<details>
<summary>Click to view code</summary>

```
1M logs/sec × 1KB per log = 1GB/sec = 86TB/day

Storage requirement (7-day retention):
  86TB × 7 = 600TB raw
  With compression (50%): 300TB
  With 2 replicas: 900TB total

Hardware needed:
  - 30 nodes × 30TB each (r5.4xlarge with attached storage)
  - 3 dedicated master nodes
  - 5 coordinator nodes (distribute load)
```

</details>

**Index strategy:**

<details>
<summary>Click to view code</summary>

```
Daily rolling indices:
  logs-2024-01-05 (hot)
  logs-2024-01-04 (warm)
  logs-2024-01-03 (warm)
  logs-2024-01-02 (cold)
  logs-2024-01-01 (cold)

Settings per day:
  - Shards: 20 (distribute across data nodes)
  - Replicas: 1 initially, scale to 2 for HA
  - Refresh interval: 30-60s (batch writes)
  - Rollover when: 50GB or 24 hours
```

</details>

**Indexing optimization:**

<details>
<summary>Click to view code (python)</summary>

```python
# Bulk indexing with Logstash
output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    bulk_path => "/_bulk"
    bulk_size => 1000
    flush_interval => 5
    compression_level => "best"
  }
}
```

</details>

**Query optimization:**

<details>
<summary>Click to view code</summary>

```
Use time-range filter (fast):
  range: { @timestamp: { gte: "2024-01-05" } }

Avoid full-text search on all logs:
  Cost: O(n) scan of all documents
  Better: Filter by log level, service, then search

Use aggregations for metrics:
  Errors per service (terms aggregation)
  Response time distribution (percentiles)
```

</details>

---

## Elasticsearch vs Alternatives

| System | Throughput | Latency | Best For | Trade-off |
|--------|-----------|---------|----------|-----------|
| **Elasticsearch** | 1M+/sec | 10-100ms | Full-text, logs, analytics | Complex, resource-hungry |
| **Solr** | 100K/sec | 50-200ms | Enterprise search | Slower, Java-heavy |
| **OpenSearch** | 1M+/sec | 10-100ms | ES alternative (AWS native) | Fewer plugins |
| **Algolia** | 100K/sec | 1-10ms | Hosted search (SaaS) | High cost, limited customization |
| **Meilisearch** | 100K/sec | 1-50ms | Fast search UX | Less flexible |

---

## Best Practices

### Operational Best Practices

✓ **Always use replicas** (min 2) for production
✓ **Monitor JVM GC** (long pauses = latency spike)
✓ **Use dedicated master nodes** (separate from data)
✓ **Set ulimit -n 65535** (file descriptors)
✓ **Enable security** (X-Pack authentication)
✓ **Monitor disk space** (leave 20% free for merge operations)
✓ **Plan for growth** (add nodes before hitting limits)
✓ **Use snapshot/restore** (daily backups to S3/GCS)

### Query Best Practices

✓ **Filter before search** (cached and faster)
✓ **Use persistent queries** (for aggregations)
✓ **Pagination with search_after** (not from/size for large offsets)
✓ **Async search for long queries** (`async_search` API)
✓ **Batch requests** (`_msearch` instead of individual queries)

### Mapping Best Practices

✓ **Use keyword for exact match** (faster, smaller)
✓ **Use text only for full-text search** (analyzer overhead)
✓ **Set explicit mappings** (avoid field explosion)
✓ **Use ignore_above** (prevent oversized keywords)
✓ **Disable source for read-only indices** (save space)

---

## Disaster Recovery Strategy

### Single-Region Setup

| Scenario | Impact | Recovery |
|----------|--------|----------|
| **Single node failure** | Auto (replicas take over) | Seconds |
| **Multiple node failure** | Partial outage (if replicas insufficient) | Minutes (nodes rejoin) |
| **Cluster failure** | Complete outage | Restore from snapshot (30min-2hrs) |

**Mitigation**: Always use 2+ replicas in production

### Multi-Region Setup

<details>
<summary>Click to view code</summary>

```
Primary Cluster (US-East)
  [Logs Index]
       ↓ CCR
Secondary Cluster (EU-West)
  [Logs Index (read-only)]

Failover process:
  1. Stop CCR replication
  2. Promote secondary to read-write
  3. Update application to point to EU-West
  4. RPO: Depends on replication lag (usually < 1 sec)
```

</details>

---

## Summary & Key Takeaways

**Elasticsearch excels at:**
- ✓ Full-text search (sub-100ms on large datasets)
- ✓ Real-time log analytics (ELK stack)
- ✓ Time-series data (metrics, events)
- ✓ Flexible schema (dynamic mappings)
- ✓ High availability (replicas, automatic failover)

**Key challenges:**
- ✗ Operational complexity (cluster management)
- ✗ Resource intensive (memory, disk, CPU)
- ✗ Consistency trade-offs (eventual consistency)
- ✗ Learning curve (complex DSL, tuning)
- ✗ Cost at scale (large clusters needed for high volume)

**Critical design questions:**
1. What's my search latency target (ms)?
2. How much data must I retain (days/months)?
3. What's my query volume (QPS)?
4. Do I need full-text or exact-match search?
5. What's my availability SLA?
6. Can I afford downtime for rebalancing?
7. What's my budget for clusters (storage, compute)?
