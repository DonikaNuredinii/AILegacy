## Scenario A — Normal Operation (AI_OK, Legacy_OK)

**Configuration**
- Endpoint: /api/v1/ai/analyze
- TOTAL_REQUESTS: 100
- CONCURRENCY: 5
- DELAY_BETWEEN_REQUESTS_SEC: 0.2
- AI_FAIL: 0
- LEGACY_DELAY_MS: 0

**Results**
- Status counts: {200: 100}
- Error rate: 0.0%
- Latency (ms): avg=116.91, min=75.27, max=279.46, p95=131.88, p99=267.00
- Total test time (s): 6.614
- Throughput (req/sec): 15.12