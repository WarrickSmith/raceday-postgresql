# 6. Tech Stack

## 6.1. Frontend

### 6.1.1. Core Framework
- **Framework:** Next.js 15+ with App Router
- **Language:** TypeScript 5.0+
- **Runtime:** Node.js 22.17.0+

### 6.1.2. Architecture Pattern
- **Server Components:** Primary rendering strategy for data fetching and static content
- **Client Components:** Used only for interactivity and real-time features
- **Streaming:** React Suspense for progressive loading
- **Caching:** Next.js 15 native caching with revalidation strategies

### 6.1.3. Performance Optimizations
- **Bundle Splitting:** Automatic route-based + manual component splitting with `next/dynamic`
- **Lazy Loading:** Progressive component loading with intersection observer
- **Code Splitting:** Tree shaking and selective SDK imports
- **Image Optimization:** Next.js Image component with priority loading
- **Bundle Analysis:** `@next/bundle-analyzer` for size monitoring

### 6.1.4. UI and Styling
- **CSS Framework:** Tailwind CSS 4.0+ (utility-first)
- **Performance CSS:** Optimized class purging and critical CSS
- **Responsive Design:** Mobile-first approach with container queries
- **Accessibility:** WCAG 2.1 compliance with semantic HTML

### 6.1.5. State Management
- **Server State:** Server Components with native fetch caching
- **Client State:** React hooks with optimized re-rendering
- **Real-time State:** Appwrite subscriptions with update batching
- **Performance:** React.memo(), useMemo(), useCallback() optimizations

### 6.1.6. Data Fetching Strategy
- **Initial Load:** Server Components with cached data fetching
- **Real-time Updates:** Client Components with Appwrite subscriptions
- **Caching:** 5-minute revalidation for stable data, instant for critical updates
- **Error Handling:** Error boundaries with graceful degradation

## 6.2. Backend Services

### 6.2.1. Primary Platform
- **Platform:** Appwrite Cloud (latest version)
- **Architecture:** Microservices with serverless functions
- **Runtime:** Node.js 22.17.0+

### 6.2.2. Appwrite SDK Strategy
- **Server SDK:** `node-appwrite` v17.0.0+ for Server Components and functions
- **Client SDK:** `appwrite` web SDK v17.0.0+ for Client Components only
- **Security:** API keys server-side only, session-based client authentication
- **Performance:** Tree-shaken imports, selective service initialization

### 6.2.3. Functions Architecture
- **Language:** JavaScript (ES2022+) for consistency
- **Pattern:** Microservices with shared utilities
- **Deployment:** Individual function deployment with CI/CD
- **Monitoring:** Structured logging and error tracking

## 6.3. Data Sources

### 6.3.1. External APIs
- **Primary API:** New Zealand TAB API
- **Rate Limiting:** Compliance with API quotas
- **Caching:** Strategic caching to reduce API calls
- **Error Handling:** Retry logic with exponential backoff

### 6.3.2. Database
- **Primary:** Appwrite Database with collections
- **Real-time:** Appwrite subscriptions for live updates
- **Caching:** Query result caching with intelligent invalidation
- **Performance:** Optimized indexing and relationship queries

## 6.4. Performance Targets

### 6.4.1. Core Web Vitals
- **Largest Contentful Paint (LCP):** <2.5 seconds
- **First Input Delay (FID):** <100 milliseconds
- **Cumulative Layout Shift (CLS):** <0.1
- **First Contentful Paint (FCP):** <1.8 seconds

### 6.4.2. Application Metrics
- **Initial Load Time:** <3 seconds for dashboard
- **Real-time Latency:** <2 seconds for subscription updates
- **Bundle Size:** <500KB for main dashboard page
- **Lighthouse Score:** 90+ for performance

### 6.4.3. Monitoring and Analysis
- **Web Vitals:** Real User Monitoring (RUM)
- **Bundle Analysis:** Automated size tracking in CI/CD
- **Performance CI:** Lighthouse CI in deployment pipeline
- **Error Tracking:** Comprehensive error monitoring and alerting

---
