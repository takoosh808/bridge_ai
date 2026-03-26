const { pool } = require('../db');
const { getObservabilitySnapshot } = require('./metrics');

let lastHealthCheck = null;
let healthCheckInProgress = false;

async function checkPostgresHealth() {
  try {
    const startTime = Date.now();
    const result = await pool.query('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'healthy',
      responseTime,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingRequests: pool.waitingCount
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

async function checkRedisHealth() {
  // Redis is optional for now; we'll check if REDIS_URL is configured
  const redisUrl = process.env.REDIS_URL || '';
  
  if (!redisUrl) {
    return {
      status: 'unconfigured',
      note: 'REDIS_URL not set'
    };
  }
  
  try {
    // For now, Redis health is a placeholder
    // In a real scenario, we would create a Redis client and ping it
    // This avoids adding a Redis dependency just for health checks
    return {
      status: 'healthy',
      note: 'Redis URL configured (no active connection check yet)'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}

function evaluateHealthStatus(postgres, redis) {
  // Determine overall health based on dependencies
  if (postgres.status !== 'healthy') {
    return 'critical'; // Postgres is required
  }
  
  if (redis.status === 'unhealthy') {
    return 'degraded'; // Redis is important but not critical
  }
  
  return 'healthy';
}

async function getHealthStatus() {
  // Return cached result if recently checked
  if (lastHealthCheck && Date.now() - lastHealthCheck.timestamp < 5000) {
    return lastHealthCheck.data;
  }
  
  // Don't run concurrent health checks
  if (healthCheckInProgress) {
    return lastHealthCheck?.data || { status: 'unknown', checking: true };
  }
  
  healthCheckInProgress = true;
  
  try {
    const startTime = Date.now();
    
    const [postgres, redis] = await Promise.all([
      checkPostgresHealth(),
      checkRedisHealth()
    ]);
    
    const metrics = getObservabilitySnapshot();
    const overallStatus = evaluateHealthStatus(postgres, redis);
    
    const health = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checkDuration: Date.now() - startTime,
      dependencies: {
        postgres,
        redis
      },
      observability: {
        totalRequests: metrics.totalRequests,
        totalErrors: metrics.totalErrors,
        errorRate: metrics.errorRate,
        avgLatencyMs: metrics.avgLatencyMs,
        p95LatencyMs: metrics.p95LatencyMs
      }
    };
    
    lastHealthCheck = {
      timestamp: Date.now(),
      data: health
    };
    
    return health;
  } catch (error) {
    return {
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message
    };
  } finally {
    healthCheckInProgress = false;
  }
}

// Periodically refresh health status in background (every 30 seconds)
setInterval(async () => {
  try {
    await getHealthStatus();
  } catch (error) {
    console.error('[health] background check failed:', error.message);
  }
}, 30 * 1000);

// Initial health check on startup
getHealthStatus().catch(err => {
  console.error('[health] startup check failed:', err.message);
});

module.exports = {
  getHealthStatus
};
