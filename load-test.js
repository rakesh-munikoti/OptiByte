import http from 'k6/http';
import { check, sleep } from 'k6';

// Test Configuration
export const options = {
    stages: [
        { duration: '30s', target: 20 },  // Ramp-up to 20 users
        { duration: '1m', target: 50 },   // Maintain 50 users (high-load test)
        { duration: '30s', target: 0 },   // Ramp-down to 0 users
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests must complete below 500ms
        http_req_failed: ['rate<0.01'],    // Error rate must be less than 1%
    },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
    // 1. Load the home page
    const resHome = http.get(`${BASE_URL}/`);
    check(resHome, {
        'home status is 200': (r) => r.status === 200,
        'home contains OptiByte': (r) => r.body.indexOf('OptiByte') !== -1,
    });
    sleep(1);

    // 2. Load the health check endpoint
    const resHealth = http.get(`${BASE_URL}/api/health`);
    check(resHealth, {
        'health status is 200': (r) => r.status === 200,
        'health says ok or warning': (r) => {
            const body = JSON.parse(r.body);
            return body.status === 'ok' || body.status === 'warning';
        },
    });
    sleep(1);

    // 3. Load the status diagnostics endpoint
    const resStatus = http.get(`${BASE_URL}/api/status`);
    check(resStatus, {
        'status status is 200': (r) => r.status === 200,
        'status returns version': (r) => {
            const body = JSON.parse(r.body);
            return body.version === '2.0.0';
        },
    });
    sleep(2);
}
