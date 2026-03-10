# TimeTrack Pro - SaaS Time Tracking Software

## Project Overview
- **Project Name**: TimeTrack Pro
- **Type**: SaaS Web Application (Laravel Backend + React Frontend)
- **Core Functionality**: Employee time tracking, productivity monitoring, invoicing, and reporting SaaS product similar to Time Doctor
- **Target Users**: Companies of all sizes, freelancers, remote teams

## Recent Product Updates (March 10, 2026)
- **Attendance navigation split**:
  - Desktop `Edit Time` now opens a dedicated time-edit/overtime screen only.
  - Full attendance calendar remains on `Attendance` screen.
- **Monitoring upgraded**:
  - Added productive/unproductive classification for website/software usage.
  - Added organization-level tool summaries and employee productivity rankings.
  - Added live monitoring payload + UI for current active tool/status per user.
  - Improved desktop tracker frequency and first-tick behavior for faster visibility.
- **Tracker context improvements**:
  - Activity now captures richer active window context (app/title/url where available).
  - Idle events now include context name to support better classification visibility.
  - Idle duration is capped per interval to avoid inflated idle totals.
- **Admin UX consolidation**:
  - Team creation/invite flow removed from Team page.
  - Team-style time/active status system moved into `User Management`.
  - Sidebar Team item removed; `/team` now redirects to `/user-management`.

---

## Technology Stack

### Backend
- **Framework**: Laravel 11.x
- **Database**: PostgreSQL
- **Authentication**: Laravel Sanctum (API tokens)
- **Queue**: Laravel Queue (for background jobs)
- **File Storage**: Laravel Flysystem

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **State Management**: React Query + Context API
- **UI Framework**: Custom CSS with modern design
- **HTTP Client**: Axios

---

## Core Features (Time Doctor Clone)

### 1. Authentication & Authorization
- [x] User Registration (with email verification)
- [x] Login/Logout
- [x] Password Reset
- [x] Multi-factor Authentication (optional)
- [x] Role-based Access Control (Admin, Manager, Employee)

### 2. Organization Management
- [x] Create/Manage Organizations
- [x] Invite team members
- [x] Organization settings
- [x] Workspace management

### 3. Time Tracking
- [x] Manual time entry
- [x] Automatic time tracking (desktop app integration)
- [x] Start/Stop timer
- [x] Add time entries retroactively
- [x] Edit/Delete time entries
- [x] Billable/Non-billable time

### 4. Screenshot Monitoring
- [x] Automatic screenshot capture
- [x] Screenshot storage and retrieval
- [x] Screenshot preview in reports
- [x] Blur sensitive screenshots option

### 5. App & URL Monitoring
- [x] Track active applications
- [x] Track visited URLs
- [x] Activity levels (active, idle, offline)
- [x] Productivity scoring

### 6. Task Management
- [x] Create tasks
- [x] Assign tasks to employees
- [x] Task status (todo, in-progress, done)
- [x] Task deadlines

### 7. Project Management
- [x] Create projects
- [x] Assign projects to team members
- [x] Project budgets
- [x] Project deadlines

### 8. Reports & Analytics
- [x] Daily/Weekly/Monthly reports
- [x] Time breakdown by project/task
- [x] Productivity reports
- [x] Export reports (PDF, CSV)
- [x] Custom date range reports

### 9. Invoicing
- [x] Create invoices from time entries
- [x] Invoice templates
- [x] Invoice status tracking
- [x] Export invoices (PDF)

### 10. Billing & Subscriptions (SaaS)
- [x] Multiple pricing plans
- [x] Subscription management
- [x] Payment integration (Stripe)
- [x] Usage tracking
- [x] Billing portal

---

## Database Schema

### Users Table
- id, name, email, password, role, organization_id, avatar, created_at, updated_at

### Organizations Table
- id, name, slug, settings, subscription_status, created_at, updated_at

### TimeEntries Table
- id, user_id, task_id, project_id, start_time, end_time, duration, description, billable, created_at, updated_at

### Screenshots Table
- id, time_entry_id, filename, thumbnail, created_at

### Activities Table
- id, user_id, type (app/url), name, duration, created_at

### Tasks Table
- id, project_id, title, description, status, assignee_id, due_date, created_at, updated_at

### Projects Table
- id, organization_id, name, description, budget, created_at, updated_at

### Invoices Table
- id, organization_id, client_name, client_email, amount, status, due_date, created_at, updated_at

---

## API Endpoints Structure

### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/forgot-password

### Organizations
- GET /api/organizations
- POST /api/organizations
- GET /api/organizations/{id}
- PUT /api/organizations/{id}

### Time Entries
- GET /api/time-entries
- POST /api/time-entries
- PUT /api/time-entries/{id}
- DELETE /api/time-entries/{id}

### Projects
- GET /api/projects
- POST /api/projects
- PUT /api/projects/{id}
- DELETE /api/projects/{id}

### Tasks
- GET /api/tasks
- POST /api/tasks
- PUT /api/tasks/{id}
- DELETE /api/tasks/{id}

### Reports
- GET /api/reports/daily
- GET /api/reports/weekly
- GET /api/reports/monthly
- GET /api/reports/productivity

### Invoices
- GET /api/invoices
- POST /api/invoices
- GET /api/invoices/{id}
- PUT /api/invoices/{id}

---

## Project Structure

```
demo_laravel_2/
├── backend/                 # Laravel API
│   ├── app/
│   ├── config/
│   ├── database/
│   ├── routes/
│   ├── .env
│   └── composer.json
│
├── frontend/                 # React Frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── types/
│   │   └── App.tsx
│   ├── package.json
│   └── vite.config.ts
│
└── SPEC.md
```

---

## Implementation Phases

### Phase 1: Setup & Authentication
- Install Laravel & React
- Configure PostgreSQL
- User authentication system
- Organization management

### Phase 2: Core Time Tracking
- Time entry CRUD
- Timer functionality
- Manual time entry

### Phase 3: Monitoring Features
- Screenshot management
- Activity tracking
- App/URL monitoring

### Phase 4: Project & Task Management
- Projects CRUD
- Tasks CRUD
- Task assignment

### Phase 5: Reports & Invoicing
- Report generation
- Invoice creation
- Export functionality

### Phase 6: SaaS Features
- Subscription management
- Billing integration
- Usage tracking
