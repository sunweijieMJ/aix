# 监控集成指南

本文档介绍如何集成 Prometheus 和 Grafana 进行服务监控。

## Prometheus 集成

### 1. Metrics 端点

服务已经内置了 Prometheus 格式的 metrics 导出端点：

```
GET /metrics/prometheus
```

### 2. 可用指标

#### 应用级别指标

- `nodejs_process_uptime_seconds` - 进程运行时间（秒）
- `application_health_status` - 应用健康状态 (1=healthy, 0.5=degraded, 0=unhealthy)

#### 内存指标

- `nodejs_memory_heap_used_bytes` - 堆内存使用量
- `nodejs_memory_heap_total_bytes` - 堆内存总量
- `nodejs_memory_rss_bytes` - 常驻内存集大小
- `nodejs_memory_external_bytes` - 外部内存使用量

#### CPU 指标

- `nodejs_cpu_user_microseconds` - 用户 CPU 时间（微秒）
- `nodejs_cpu_system_microseconds` - 系统 CPU 时间（微秒）

#### HTTP 请求指标

- `http_requests_total` - HTTP 请求总数
- `http_requests_successful_total` - 成功的 HTTP 请求数
- `http_requests_failed_total` - 失败的 HTTP 请求数
- `http_request_rate_per_second` - 每秒请求速率

#### HTTP 响应时间指标

- `http_response_time_average_milliseconds` - 平均响应时间
- `http_response_time_p50_milliseconds` - P50 响应时间
- `http_response_time_p95_milliseconds` - P95 响应时间
- `http_response_time_p99_milliseconds` - P99 响应时间

#### 错误率指标

- `http_errors_total` - HTTP 错误总数
- `http_error_rate_percent` - HTTP 错误率（百分比）

#### 数据库指标

- `postgresql_pool_total_connections` - 连接池总连接数
- `postgresql_pool_idle_connections` - 连接池空闲连接数
- `postgresql_pool_waiting_count` - 等待中的连接请求数

#### 缓存指标

- `cache_keys_total` - 缓存键总数
- `cache_hits_total` - 缓存命中总数
- `cache_misses_total` - 缓存未命中总数
- `cache_hit_rate_percent` - 缓存命中率（百分比）

### 3. Prometheus 配置

创建 `prometheus.yml` 配置文件：

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'base-node-server'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics/prometheus'
    scrape_interval: 10s
```

### 4. 使用 Docker 运行 Prometheus

```bash
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

## Grafana 集成

### 1. 安装 Grafana

使用 Docker 运行 Grafana：

```bash
docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

### 2. 添加 Prometheus 数据源

1. 访问 `http://localhost:3000`（默认用户名/密码：admin/admin）
2. 进入 Configuration → Data Sources
3. 添加 Prometheus 数据源
4. 设置 URL 为 `http://prometheus:9090`（如果使用 Docker 网络）

### 3. 推荐的仪表板

#### 应用性能仪表板

创建包含以下面板的仪表板：

##### 1. 请求速率
```promql
rate(http_requests_total[5m])
```

##### 2. 平均响应时间
```promql
http_response_time_average_milliseconds
```

##### 3. 错误率
```promql
http_error_rate_percent
```

##### 4. 内存使用
```promql
nodejs_memory_heap_used_bytes / nodejs_memory_heap_total_bytes * 100
```

##### 5. 数据库连接池
```promql
postgresql_pool_total_connections
postgresql_pool_idle_connections
```

##### 6. 缓存命中率
```promql
cache_hit_rate_percent
```

### 4. 告警规则示例

创建 `alerts.yml`：

```yaml
groups:
  - name: application_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: http_error_rate_percent > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
          description: "Error rate is {{ $value }}%"

      - alert: HighResponseTime
        expr: http_response_time_p95_milliseconds > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High response time detected"
          description: "P95 response time is {{ $value }}ms"

      - alert: LowCacheHitRate
        expr: cache_hit_rate_percent < 70
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "Low cache hit rate"
          description: "Cache hit rate is {{ $value }}%"

      - alert: DatabaseConnectionPoolExhausted
        expr: postgresql_pool_idle_connections < 2
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Database connection pool nearly exhausted"
          description: "Only {{ $value }} idle connections remaining"
```

## Docker Compose 完整配置

创建 `docker-compose.monitoring.yml`：

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - ./alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    depends_on:
      - prometheus
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:latest
    container_name: alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    networks:
      - monitoring

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
```

## 启动监控栈

```bash
# 启动所有监控服务
docker-compose -f docker-compose.monitoring.yml up -d

# 查看服务状态
docker-compose -f docker-compose.monitoring.yml ps

# 查看日志
docker-compose -f docker-compose.monitoring.yml logs -f
```

## 访问服务

- **Prometheus**: `http://localhost:9090`
- **Grafana**: `http://localhost:3000`（admin/admin）
- **AlertManager**: `http://localhost:9093`
- **Application Metrics**: `http://localhost:3001/metrics/prometheus`

## 监控最佳实践

### 1. 关键指标监控

- **响应时间**: P95 < 500ms, P99 < 1000ms
- **错误率**: < 1%
- **可用性**: > 99.9%
- **缓存命中率**: > 80%

### 2. 告警策略

- **Critical**: 影响服务可用性，需要立即处理
- **Warning**: 可能影响性能，需要关注
- **Info**: 信息性告警，可以延后处理

### 3. 数据保留策略

- **Prometheus**: 保留 15 天的原始数据
- **Grafana**: 保留关键指标的长期趋势（通过聚合）

### 4. 性能优化建议

- 根据 metrics 数据调整数据库连接池大小
- 根据缓存命中率调整缓存 TTL
- 根据响应时间分析性能瓶颈
- 根据错误率定位问题代码

## 故障排查

### 1. Prometheus 无法抓取指标

检查：
- 服务是否正常运行
- `/metrics/prometheus` 端点是否可访问
- Prometheus 配置文件是否正确

### 2. Grafana 无数据

检查：
- Prometheus 数据源配置是否正确
- PromQL 查询是否有错误
- 时间范围是否正确

### 3. 高内存使用

查看：
- `nodejs_memory_heap_used_bytes` 指标
- 检查是否有内存泄漏
- 调整 Node.js 内存限制

## 参考资源

- [Prometheus 文档](https://prometheus.io/docs/)
- [Grafana 文档](https://grafana.com/docs/)
- [Node.js Monitoring Best Practices](https://nodejs.org/en/docs/guides/simple-profiling/)
