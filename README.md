# Student Performance & Study Habits

A full-stack web application for analyzing and predicting student performance based on study habits. Built with a React/Vite frontend and Express/MySQL backend, featuring machine learning predictions, notification center, role-based access control, and schema-agnostic design that adapts to any CSV dataset.

## Features

- **Authentication System**: Secure login/registration with JWT tokens, password hashing (bcryptjs), and role-based access (admin/teacher/student)
- **CRUD Operations**: Create, read, update, delete student records with form validation
- **Dynamic Dashboard**: Interactive KPI cards and charts that adapt to dataset columns
- **Machine Learning Pipeline**: 
  - Regression model for final score prediction (CatBoost)
  - Classification model for grade prediction (Random Forest)
  - Prediction history tracking with event persistence
  - Model drift monitoring with standardized mean shift calculation
- **What-If Simulator**: Modify study habit parameters to see impact on predicted outcomes
- **Saved What-If Scenarios**: Persist successful simulations, mark preferred scenarios, and compare different approaches
- **Notification Center**: Real-time alerts for study goals, weekly check-ins, teacher feedback, and risk alerts with preference controls
- **Study Goals & Weekly Check-ins**: Set academic targets and track progress with completion analytics
- **Personal Assignments & Deadlines**: Students can track their own coursework, priorities, deadlines, and completion state with timezone-safe overdue indicators
- **Internationalization**: Full English/Vietnamese localization with synchronized key parity
- **Role-Based Navigation**: 
  - Students: Personal dashboard, goal tracking, simulation tools
  - Teachers: Class analytics, ML monitoring, student management
  - Administrators: User management, system oversight, all teacher/student features
- **Schema-Agnostic Design**: Automatically adapts to CSV column structure at import time - no hardcoded column names
- **Security Hardening**: 
  - CSRF protection via Origin/Referer headers
  - Parameterized queries to prevent SQL injection
  - Input validation and sanitization
  - XSS prevention through escaped templates
  - Rate limiting on authentication endpoints
  - Audit logging for sensitive operations
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS
- **Production Ready**: Environment configuration, process management, and build optimization

## Technology Stack

### Frontend
- **React 18.3** with **Vite 5.4** as the active SPA in `frontend/`
- **React Router 6.26** with browser-history routing and role-protected route groups
- **Tailwind CSS 3.4** compiled through PostCSS using semantic design-token aliases
- **Chart.js 4.4** with **react-chartjs-2 5.2** for responsive data visualization
- **Lucide React** plus the shared SVG icon registry for consistent iconography
- Native **Fetch API** wrapper with session-cookie credentials
- Custom English/Vietnamese `LanguageProvider` with synchronized locale objects
- Node's built-in **`node:test`** runner for frontend utility and contract tests

### Backend
- **Node.js 22** runtime
- **Express 4.19** REST API server
- **mysql2/promise 3.10** connection pool for MySQL 8+
- **jsonwebtoken 9** for authentication tokens
- **bcryptjs 3** for password hashing
- **csv-parse 5.5** for streaming CSV import
- **cookie-session** for session management
- **helmet** for security headers (production)
- **express-rate-limit** for authentication endpoint protection

### Machine Learning
- **Python 3.11** runtime
- **scikit-learn** for baseline models and utilities
- **XGBoost** and **CatBoost** for gradient boosting
- **Random Forest** for classification
- **pandas** and **NumPy** for data manipulation
- **joblib** for model serialization
- **MLflow** for experiment tracking (optional)

### DevOps & Infrastructure
- **MySQL 8.0.45** database with `student_performance` schema
- **GitHub Actions** for CI/CD (Node.js 22, Ubuntu)
- **Nodemon** for development auto-restart
- **ESLint** and **Prettier** for code quality
- **Jest** and **node:test** for testing

### Database
- **Automated schema detection** from CSV headers at import time
- **Two-pass type inference** (peek + stream) for robust importing
- **STRICT mode compliance** with row-by-row fallback for invalid data
- **Audit tables** for tracking changes to critical entities
- **Connection pooling** with configurable limits

## UI Refresh — Consistent Education Dashboard

The active interface is the React/Vite SPA under `frontend/`; the Express server serves its production build and exposes the existing API. `frontend/src/App.jsx` preserves the established URLs and authorization gates while all authenticated route groups render through the shared `AppShell` in `frontend/src/components/AppShell.jsx`.

### Application shell and navigation

- Desktop users receive one persistent left sidebar with grouped, role-specific destinations, a clear active-route state, page context, notification access, language/theme controls, account identity, and logout.
- Student navigation is generated independently from teacher and admin navigation. Hiding a destination is not treated as authorization; `ProtectedRoute` continues to enforce each route's roles.
- Tablet and mobile widths use an accessible drawer with a backdrop, Escape and outside-interaction closing, focus trapping/restoration, body-scroll locking, and route-change closing.
- The shell owns the single document `<main>` landmark and skip link. Pages should render sections and headers inside that landmark rather than nesting another `<main>`.

### Theme and design tokens

`frontend/src/index.css` defines the light and dark semantic tokens, and `frontend/tailwind.config.js` exposes them as Tailwind aliases:

```text
canvas / surface / surface-muted
ink / ink-muted / divider
action / action-muted / action-strong
success / warning / danger / focus-ring
```

The explicit light or dark choice is stored in `localStorage`. When no valid choice has been saved, `useTheme` follows `prefers-color-scheme`; both modes set the browser `color-scheme`. Motion is reduced when the user requests `prefers-reduced-motion`.

### Shared UI conventions

- Reuse `Button`, `Input`, `Select`, `Checkbox`, `RadioGroup`, `Card`, `KPICard`, `Table`, `Modal`, `ConfirmDialog`, `EmptyState`, `ErrorState`, skeletons, and layout helpers from `frontend/src/components/ui/`.
- Interactive controls use visible focus states and at least 44px touch targets. Modal and drawer flows preserve keyboard focus.
- Wide tables scroll inside their own contained region; page layouts must not create document-wide horizontal scrolling.
- User-facing copy belongs in both `frontend/src/locales/en.js` and `frontend/src/locales/vi.js`. Add parity coverage when introducing a namespace or shared key set.
- Charts consume `frontend/src/utils/chartTheme.js` for fixed series identity, light/dark contrast, locale-aware numeric formatting, responsive legends/tooltips, reduced motion, and consistent mark sizing. Keep missing values as missing rather than converting them to zero, and provide a textual summary or data table when a chart is the only visual representation.

Future authenticated pages should be added to the appropriate role group in `frontend/src/components/appShell.js`, protected independently in `App.jsx`, and composed from the shared semantic components instead of introducing another application shell.

Verify frontend changes with:

```bash
npm --prefix frontend test
npm --prefix frontend run build
git diff --check
```

## Project Structure

```
├─ README.md
├─ package.json
├─ .env.example
├─ .gitignore
├─ schema_map.json              # GENERATED by import script
├─ seed/
│   └─ sample_students.csv      # Sample data (50 rows, gitignored)
├─ public/
│   └─ vite.svg                 # Vite logo
├─ frontend/                    # Active React/Vite SPA
│   ├─ package.json
│   ├─ vite.config.js
│   ├─ tailwind.config.js       # Semantic token aliases and component theme
│   ├─ index.html
│   └─ src/
│       ├─ main.jsx             # BrowserRouter entry point
│       ├─ App.jsx              # Providers, protected role groups, and routes
│       ├─ api.js               # Fetch wrapper with session credentials
│       ├─ index.css            # Light/dark tokens and global component styles
│       ├─ components/
│       │   ├─ AppShell.jsx     # Shared responsive authenticated shell
│       │   ├─ appShell.js      # Role navigation and route-state utilities
│       │   ├─ notifications/   # Bell, items, and preference dialog
│       │   ├─ goals/           # Goal progress UI and accessible charts
│       │   └─ ui/              # Buttons, fields, cards, tables, modals, feedback states
│       ├─ hooks/
│       │   ├─ useAuth.jsx
│       │   ├─ useLanguage.jsx
│       │   ├─ useNotifications.jsx
│       │   └─ useTheme.jsx
│       ├─ pages/               # Existing student, teacher, admin, and shared routes
│       ├─ locales/
│       │   ├─ en.js
│       │   ├─ vi.js
│       │   └─ *LocaleParity.test.js
│       └─ utils/
│           ├─ chartTheme.js    # Shared Chart.js colors, marks, formatting, and motion
│           ├─ assignments.js   # Assignment validation, timezone, and list-state helpers
│           ├─ notifications.js # Notification formatting and trusted navigation
│           └─ *.test.js        # Node test files colocated with utilities
├─ ml/                          # Machine Learning pipeline
│   ├─ requirements.txt
│   ├─ fetch_data.py            # MySQL → CSV cache
│   ├─ train.py                 # Model training (regression + classification)
│   ├─ inference.py             # CLI + stdin JSON prediction
│   ├─ student_example.json     # Example input for inference
│   ├─ README.md
│   ├─ models/                  # Saved models (gitignored)
│   │   ├─ regressor.joblib     # Final score predictor
│   │   ├─ classifier.joblib    # Grade predictor
│   │   ├─ preprocessor.joblib  # Feature preprocessing pipeline
│   │   ├─ metrics.json         # Evaluation results
│   │   └─ llm/                 # Experimental LLM scaffold (not integrated)
│   ├─ data/                    # Cached training data (gitignored)
│   │   └─ students.csv
│   └─ output/                  # Generated plots (gitignored)
│       ├─ feature_importance_*.png
│       ├─ predictions_vs_actual.png
│       └─ confusion_matrix.png
└─ src/                         # Express backend
   ├─ server.js                 # Entry point (table initialization)
   ├─ app.js                   # Express factory (REST API + static files)
   ├─ config/
   │   └─ db.js                 # mysql2 pool + readiness check
   ├─ middleware/
   │   ├─ apiAuth.js            # requireApiAuth, requireApiAdmin
   │   ├─ apiRateLimit.js       # Authentication endpoint protection
   │   ├─ apiLogger.js          # Request/response logging
   │   ├─ csrfProtection.js     # Origin/Referer CSRF protection
   │   └─ errorHandler.js       # Centralized error handling
   ├─ utils/
   │   ├─ schemaMap.js          # load/validate schema_map.json
   │   ├─ columns.js            # column whitelist (SQL injection boundary)
   │   ├─ chartConfig.js        # schema-agnostic chart assignment
   │   ├─ mlMonitoring.js       # ML monitoring utilities (drift calculation)
   │   └─ predictionHistory.js  # prediction event history utilities
   ├─ controllers/
   │   ├─ apiController.js      # shared API handlers (JSON responses)
   │   └─ assignmentController.js # assignment API validation and ownership boundary
   ├─ services/
   │   ├─ assignmentService.js  # assignment table, SQL, lifecycle, and deadlines
   │   ├─ authService.js        # ALL SQL for users table + auth
   │   ├─ studentService.py     # ALL SQL for students (parameterized only)
   │   ├─ goalsService.js       # study goals CRUD
   │   ├─ weeklyCheckinService.js # weekly check-in CRUD
   │   ├─ notificationService.js # notification CRUD + preferences
   │   ├─ predictionHistoryService.js # recording prediction events
   │   ├─ modelSnapshotService.py # deterministic model version hashes
   │   ├─ mlDriftService.py     # drift calculation (standardized mean shift)
   │   ├─ whatIfScenarioService.py # saved scenario management
   │   └─ simulationService.py  # What-If scenario baseline/simulation runner
   ├─ routes/
   │   └─ apiRoutes.js          # all API route definitions
   └─ scripts/
       ├─ import.js             # CSV → MySQL importer + schema_map emitter
       ├─ seedAdmin.js          # administrator bootstrap
       └─ resetDb.js            # development database reset utility
```

## Prerequisites

- **Node.js 22** (or compatible LTS version)
- **MySQL 8.0+** (local or remote instance)
- **Python 3.11** (for ML pipeline - optional if using pre-trained models)
- **Git** (for version control)

## Installation & Setup

### 1. Environment Configuration

```bash
# Clone repository
git clone https://github.com/ShiroHafomi/SPSH.git
cd SPSH

# Create environment file
cp .env.example .env

# Edit .env with your configuration:
#   DB_HOST=localhost
#   DB_PORT=3306
#   DB_NAME=student_performance
#   DB_USER=your_username
#   DB_PASSWORD=your_password
#   JWT_ACCESS_SECRET=your_access_secret
#   JWT_REFRESH_SECRET=your_refresh_secret
#   NODE_ENV=development
#   PORT=3001
#   APP_ORIGIN=http://localhost:5173
#   RATE_LIMIT_WINDOW_MS=900000
#   RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Install Dependencies

```bash
# Install backend dependencies
npm install

# Install frontend dependencies
npm install --prefix frontend

# Install ML dependencies (optional but recommended for full functionality)
cd ml
pip install -r requirements.txt
cd ..
```

### 3. Database Initialization

```bash
# Import sample data (creates database, tables, and schema_map.json)
npm run import:sample

# OR import your own CSV file
npm run import -- --file path/to/your/dataset.csv --replace
```

### 4. Create Administrator Account

Public registration is disabled for security. Create the first admin user:

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=SecurePassword123! \
ADMIN_NAME="Administrator" \
npm run seed:admin
```

## Running the Application

### Development Mode

```bash
# Start backend server (API on http://localhost:3001)
npm run dev

# In a separate terminal, start frontend dev server
npm run dev --prefix frontend
```

The frontend will be available at http://localhost:5173 and automatically proxy API requests to http://localhost:3001.

### Alternative: Full-Stack Development (Single Command)

```bash
# Starts both backend and frontend concurrently
npm run dev:full
```

### Production Mode

```bash
# Build frontend for production
npm run build --prefix frontend

# Start production server
npm start
```

The production server serves the React frontend from Express on http://localhost:3001.

### One-Time Setup Script

```bash
# Runs: install → import:sample → seed:admin → dev:full
npm run setup
```

## API Overview

All API endpoints require authentication unless otherwise noted. Responses are JSON-formatted.

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Authenticate user, returns access token |
| POST | `/api/auth/register` | No | **Disabled** - returns 403 Forbidden |
| POST | `/api/auth/logout` | Yes | Destroy session |
| GET | `/api/auth/me` | Yes | Get current user profile |

### Students
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/students` | Yes | Paginated list with search/sort |
| GET | `/api/students/:id` | Yes | Single student record |
| POST | `/api/students` | Yes | Create new student |
| POST | `/api/students/:id` = Yes | Update existing student |
| POST | `/api/students/:id/delete` = Yes | Delete student |

### Dashboard & Analytics
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET = `/api/dashboard/stats` | Yes | KPIs + chart configuration |
| GET = `/api/admin/users` | Yes + Admin | List all system users |
| POST = `/api/admin/users/:id/delete` | Yes + Admin | Delete user (not self) |

### Notifications
| Method | Endpoint | Auth = | Description = |
|--------|----------|--------|-------------|
| GET | `/api/notifications` | Yes | Paginated notification list |
| GET | `/api/notifications/unread-count` | Yes | Unread notification count |
| PUT | `/api/notifications/:id/read` | Yes | Mark notification as read |
| PUT | `/api/notifications/read-all` | Yes | Mark all notifications as read |
| DELETE | `/api/notifications/:id` = Yes | Delete notification |
| GET | `/api/notifications/preferences` = Yes | Get notification preferences |
| PUT | `/api/notifications/preferences` = Yes | Update notification preferences |

### Machine Learning
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/predict` = Yes | Generate prediction from student profile |
=POST | `/api/predict/feedback` = Yes | Submit prediction accuracy feedback |
| GET | `/api/predict/baseline` = Yes | Get baseline prediction for current inputs |
| POST | `/api/predict/simulation` = Yes | Get simulation prediction for modified inputs |
| GET = `/api/predict/history` = Yes | Get paginated prediction history |
| GET = `/api/predict/drift` = Yes | Get model drift status |
| GET = `/api/predict/snapshots` = Yes | Get available model snapshots |
| GET = `/api/predict/snapshot/:id` = Yes | Get specific model snapshot details |
| GET | `/api/what-if/scenarios` = Yes | List saved What-If scenarios |
| POST = `/api/what-if/scenarios` = Yes | Create new saved scenario |
| PATCH = `/api/what-if/scenarios/:id` = Yes | Update scenario name |
| PATCH = `/api/what-if/scenarios/:id/preferred` = Yes | Mark scenario as preferred |
| DELETE = `/api/what-if/scenarios/:id` = Yes | Delete saved scenario |
| GET = `/api/what-if/scenarios/:id/compare` = Yes | Compare two saved scenarios |

### Goals & Check-ins
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/goals` = Yes | List user's study goals |
| POST | `/api/goals` = Yes | Create new study goal |
| PUT | `/api/goals/:id` = Yes | Update study goal |
| DELETE | `/api/goals/:id` = Yes | Delete study goal |
| GET | `/api/weekly-checkins` = Yes | List weekly check-ins |
| POST | `/api/weekly-checkins` = Yes | Create new weekly check-in |

### Personal Assignments — Phase 1

Personal assignment tracking is available only to authenticated users with the `student` role and a linked student record. The frontend route is `/student/assignments`; every API query and mutation resolves ownership from the authenticated account instead of accepting a student ID from the client. Assignment data is removed when its owning user account is deleted.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/student/me/assignments` | Student | List the current student's assignments, pagination, and full-result summary |
| POST | `/api/student/me/assignments` | Student | Create a personal assignment |
| GET | `/api/student/me/assignments/:assignmentId` | Student | Get one owned assignment |
| PATCH | `/api/student/me/assignments/:assignmentId` | Student | Update an owned assignment using its optimistic `version` |
| DELETE | `/api/student/me/assignments/:assignmentId?version=:version` | Student | Delete an owned assignment only at the expected optimistic `version` |

Assignments support `todo`, `in_progress`, and `done` statuses and `low`, `medium`, and `high` priorities. The list API accepts `q`, `subject`, `status`, `priority`, `overdue`, `from`, `to`, `page`, `size`, and an allowlisted `sort` value. Search covers title and subject. Date filters apply to `due_at` as a half-open UTC range; the frontend converts inclusive viewing dates using the browser's viewing timezone. Pagination defaults to 20 items and is capped at 100. Summary counts (`todo`, `inProgress`, `done`, and `overdue`) cover the complete filtered result, not only the current page. Overdue is a subset of unfinished assignments and must not be added to the status totals.

A deadline is accepted only as a timestamp with an explicit UTC offset, stored as a UTC instant, and displayed in the assignment's selected IANA timezone together with that timezone. Past deadlines are valid. The server returns an `asOf` snapshot and computes time-dependent fields dynamically:

```text
isOverdue = status != done AND due_at < asOf
completedLate = status == done AND completed_at > due_at
```

No background job stores or changes an overdue status. The visible frontend refreshes deadline indicators periodically and refreshes the list when the tab regains focus or visibility.

Entering `done` records `completed_at` using server time. Repeating `done` preserves the first completion time. Reopening requires UI confirmation and clears `completed_at`. A completed assignment must be reopened in a separate update before its deadline can change. Title or description edits do not reset completion, and changing a deadline does not complete the assignment. Updates and deletions require the current optimistic `version`, so a stale confirmation cannot overwrite or delete newer work. Assignment operations do not update grades, machine-learning inputs, Study Goals, or Study Planner session minutes.

Primary implementation and test files:

- `src/services/assignmentService.js` and `src/services/assignmentService.test.js`
- `src/controllers/assignmentController.js` and `src/controllers/assignmentController.test.js`
- `frontend/src/pages/Assignments.jsx`
- `frontend/src/utils/assignments.js` and `frontend/src/utils/assignments.test.js`
- `frontend/src/locales/assignmentLocaleParity.test.js`

Run the relevant suites and production build with:

```bash
npm test
npm --prefix frontend test
npm --prefix frontend run build
```

Phase 1 does **not** include teacher assignment distribution, student submissions or file uploads, grading, automatic reminders, external calendar synchronization, or automatic changes to Study Goals or machine-learning data.

## User Roles & Permissions

### Student
- Access to personal dashboard and profile
- CRUD operations on own student record (if linked)
- Study goal creation and tracking
- Personal assignment and deadline tracking at `/student/assignments`
- Weekly check-in submission
- What-If simulation and scenario saving
- Notification center with preference controls
- Baseline and simulation predictions

### Teacher *(Organization-Wide Scope)*
- All Student permissions plus:
- View analytics for all students in organization
- Access ML monitoring dashboard (organization-wide)
- Submit feedback on student predictions
- View notification center for organization
- Cannot modify other users' accounts or system settings

### Administrator
- All Teacher permissions plus:
- Create, view, and delete user accounts
- System oversight and configuration access
- Full access to all student and teacher features
- Cannot delete own account

### Role Hierarchy
```
Administrator
    ↳ Teacher
        ↳ Student
```

Higher roles inherit all permissions of lower roles.

## Academic Intervention Generator

Administrators can use **Admin → AI Tools → Academic Intervention** to generate a student-specific note with a predicted score/grade, risk factors, and rule-based recommendations. This uses the existing local Python ML service and templates, not an external generative-AI API. Review the note before using it for academic decisions.

### Configuration and API contract

- Use `POST /api/admin/students/:id/intervention`, with the existing authenticated admin cookie. `:id` is the positive safe-integer internal `students.id`, not the display student number. The React action sends no body and never supplies actor identity or a role. GET is not a generation endpoint.
- The backend needs its normal MySQL/authentication configuration and an imported student table. The schema adapter accepts `schema_map.json`'s `columns` array and maps semantic tags/canonical names to the ten supported model features. Required model values must be present, finite, and within the supported ranges; bad data is rejected, not clamped.
- Install the Python dependencies in `ml/requirements.txt` into the interpreter used by the server. `ML_PYTHON_CMD` selects that executable (default: `py` on Windows; configure `python3` or the appropriate executable elsewhere). The runner invokes `ml/inference.py --json -` without a shell. `ML_TIMEOUT_MS` defaults to 15000; `ML_MAX_CONCURRENT` defaults to 2, with a bounded waiting queue.
- Deploy a compatible existing artifact set at `ml/models/`: `regressor.joblib`, `classifier.joblib`, `preprocessor.joblib`, and `metrics.json`. Generation does **not** automatically train or download models. It cannot produce a note when required inference dependencies are unavailable. No external AI API key is required.
- Successful responses retain `studentId`, `student_id`, `interventionNote`, `prediction`, and `riskAssessment`. The UI reads `interventionNote` and accepts the legacy `intervention_note` spelling. Additional fields `interventionStored` and `persistenceCode` report whether the generated note was saved.

| Status | Meaning |
| --- | --- |
| 200 | A real prediction and full intervention note were generated. Check `interventionStored` before assuming the note was saved. |
| 400 | Invalid student record ID. |
| 401 / 403 | Missing authentication / insufficient permission. |
| 404 | No student record with that internal ID. |
| 422 | Required student prediction data is missing or invalid. |
| 429 | The existing admin AI request rate limit was reached. |
| 503 | Inference unavailable, including capacity, timeout, process failure, missing artifacts, invalid JSON, or invalid prediction output. |
| 500 | Unexpected database or internal failure; the client receives a safe generic error. |

### Persistence and troubleshooting

The imported `notes` column may be too short for an intervention (for example, `VARCHAR(66)`). The service attempts to save once, without truncating the note. A known MySQL length-limit error returns the full note with `interventionStored: false` and `persistenceCode: "INTERVENTION_STORAGE_LIMIT"`; a missing writable notes field returns `INTERVENTION_NOT_STORED`. The UI warns the administrator to copy the note. Unexpected database errors still fail safely. This fix does not alter the database schema or introduce prediction-history writes, and the teacher counsel path retains its existing audit behavior.

For 422, correct the student's model inputs. For 503, check the server's Python executable, installed dependencies, compatible artifact set, timeout, and workload. For 500, inspect server-side operational diagnostics and database availability rather than exposing exception text to the browser. Retry preserves the selected student. Changing the student clears stale results, and repeated clicks/Enter events during a request do not launch duplicate generation.

Chrome `Unchecked runtime.lastError` messages about a closed message channel or missing receiver are separate from an HTTP response shown in the Network panel. This repository contains no `chrome.runtime` or `browser.runtime` messaging integration. To confirm the source locally, compare an Incognito window with **all extensions disabled**, another browser, and a page with the application stopped. If the messages disappear without extensions, investigate the extension; do not suppress application errors or patch browser APIs. An actual `/api/.../intervention` failure must still be investigated independently.

### Regression tests

The focused tests mock database calls and the Python process; they need no running MySQL server, actual inference, training, external API, or secrets:

```bash
node --test src/controllers/adminIntervention.test.js src/controllers/adminInterventionRoute.test.js src/utils/mlValidation.test.js src/utils/mlRunner.test.js src/services/mlService.test.js
node --test frontend/src/utils/adminAiTools.test.js frontend/src/api.test.js frontend/src/locales/uiRefreshLocaleParity.test.js
npm test
npm --prefix frontend test
npm --prefix frontend run build
```

## Academic Intervention Follow-up (Support Plans)

Support plans turn reviewed recommendations into practical tasks. They are separate from personal assignments and numeric study goals. Task completion measures follow-through, **not evidence of improved academic performance**.

### Workflow and permissions

- **Admin:** Generate an intervention under **Admin → AI Tools**, review the result, then choose **Create support plan**. Only bounded action bullets from the recommendation section are suggested as editable tasks; raw model data, risk details, custom notes, and the full generated note are not copied into the plan. Review/edit/remove suggestions and save a **draft**. Generation never creates or activates a plan automatically.
- **Manual creation:** Open **Support plans** (`/admin/support-plans`), enter the internal `students.id`, load that student's plans, and create a draft. This requires neither a generated note nor ML availability. The page also supports `/admin/support-plans?studentId=7`.
- **Activation:** An admin explicitly activates a reviewed draft with at least one task. The student can then view it under **Support plans** (`/student/support-plans`) and update task status. Admins can review/update active task progress and explicitly complete or cancel the plan.
- **Students:** The backend resolves identity from the authenticated user's linked `student_id`, never from request body/query ownership. Students see only their own active, completed, and cancelled plans; drafts are hidden. They may change only task status on active plans. Plan ownership and task membership are checked on each operation.
- **Teachers:** No support-plan access in this phase. Existing organization-wide teacher analytics permissions are not a reliable teacher-to-student assignment. No assignment relationship or broad management permission is invented. This feature's exact role gates take precedence over the general role hierarchy above.

Saved plans remain usable if the generation service later becomes unavailable. No training, external AI dependency, or automatic conversion from stored notes is introduced.

### Database initialization

`src/server.js` calls `ensureSupportPlanTables()` after the existing dependencies are initialized. With the usual database configuration and imported student table in place, start/restart through `npm start` or `npm run dev` and check for **Academic support tables: ready**. The database account needs permission to create tables and foreign keys. Do not re-import or replace existing student data to enable this feature.

Two idempotent `CREATE TABLE IF NOT EXISTS` statements create:

- `academic_support_plans`: student/creator references, title, objective, draft/active/completed/cancelled status, start/due dates, version, created/updated timestamps, and completion timestamp. Student-scoped indexes support creation-order pagination and status filtering.
- `academic_support_tasks`: parent plan reference, title, description, pending/in_progress/completed status, optional due date, server-controlled sort order, version, and timestamps. A `(plan_id, sort_order, id)` index supports bounded task retrieval.

IDs and versions use `INT UNSIGNED`. Deleting a student cascades to their plans; deleting a creator sets the creator reference to NULL; deleting a plan cascades only to its tasks. Deleting a task or plan cannot delete users or students. There is **no permanent-delete API**: use cancellation. Startup does not alter an incompatible pre-existing table definition; investigate a failed readiness message rather than running a destructive import.

### API contract

All paths below are under `/api`, use existing authentication and CSRF protection, and return JSON. New mutation routes reuse the authenticated assignment mutation rate limiter.

| Method | Path | Operation |
| --- | --- | --- |
| GET | `/admin/students/:studentId/support-plans` | Admin list, optional `page`, `size`, `status` |
| POST | `/admin/students/:studentId/support-plans` | Create draft (201) |
| GET | `/admin/students/:studentId/support-plans/:planId` | View plan and tasks |
| PATCH | `/admin/students/:studentId/support-plans/:planId` | Replace draft content/tasks atomically |
| POST | `/admin/students/:studentId/support-plans/:planId/activate` | Activate draft |
| POST | `/admin/students/:studentId/support-plans/:planId/complete` | Explicitly complete active plan |
| POST | `/admin/students/:studentId/support-plans/:planId/cancel` | Cancel draft or active plan |
| PATCH | `/admin/students/:studentId/support-plans/:planId/tasks/:taskId` | Update active task status |
| GET | `/student/me/support-plans` | List own non-draft plans |
| GET | `/student/me/support-plans/:planId` | View own non-draft plan/tasks |
| PATCH | `/student/me/support-plans/:planId/tasks/:taskId` | Update own active task status |

Create body: `{ title, objective, start_date, due_date, tasks: [{ title, description?, due_date? }] }`. Draft edits send the full editable draft plus its current `version`; no task IDs, task statuses, ownership, or creator fields are writable. Lifecycle actions send `{ version }`. Task updates send `{ status, version, planVersion }`, requiring both current versions.

Required title/objective/task title bounds are 1–150 / 1–2,000 / 1–150 characters; task descriptions are optional and limited to 1,000. Text is trimmed, unsupported control characters rejected, and tasks are limited to 20. Unknown writable fields are rejected. IDs/versions must be positive safe integers. Dates must be real `YYYY-MM-DD` calendar dates (MySQL years 1000–9999); plan due date must be on/after start, and optional task deadlines must fall within that range.

Lists return `{ plans, total, page, size, totalPages }`; details return `{ plan }`; mutations return `{ plan, warnings }`. Lists default to 20, allow at most 100 records per page, cap offset at 100,000, allow only the documented status filters, and sort deterministically by `created_at DESC, id DESC`. Tasks are returned in `sort_order ASC, id ASC` order. An admin list for a nonexistent student is empty; creation verifies the student exists. Errors use safe `{ error, code }` responses: 400 validation, 401 authentication, 403 role access, 404 unavailable resource, 409 stale version or invalid lifecycle action, and generic 500 unexpected failure. Unauthorized students cannot distinguish another student's plan from a nonexistent plan.

### Lifecycle, progress, and concurrency

- `draft → active`: at least one task required.
- `draft → cancelled` and `active → cancelled`: allowed.
- `active → completed`: every task must be completed, with at least one task.
- Only draft content/tasks can be edited. Completed/cancelled plans are read-only and cannot be reopened. Cancelled plans, including cancelled drafts, are visible to their student.
- Active tasks can move among pending, in_progress, and completed. Reopening a task clears its completion timestamp. Repeating its current status with current versions leaves versions unchanged.
- Progress is `completedTaskCount / totalTaskCount * 100`, or zero for an empty draft. A plan at 100% stays active until an admin explicitly completes it.
- Date-only deadlines include the entire **UTC due date**. Overdue is derived: active plan, deadline before today's UTC date, and unfinished tasks. It is not a persisted status. Completion instants are recorded in UTC.

Multi-table operations use transactions and rollback on partial failure. Writers lock the parent plan first. Content/lifecycle changes increment the plan version; a changed task status increments both task and plan versions. Stale writes return **409** instead of overwriting newer changes. The UI refreshes current data after conflicts, preserves unsaved draft edits, and offers an explicit replacement with the latest draft rather than silently rebasing edits.

### Notifications, audit, and limitations

Activation attempts one in-app `support_plan_activated` notification **after commit**, only for a uniquely linked active student account and when the existing `teacherFeedback` preference permits it (labelled **Staff feedback and support plans**). Metadata contains only `planId`; notification keys and routing are allowlisted. The existing per-user deterministic dedupe key prevents duplicate stored activation events. Draft saves do not notify. Repeated activation cannot send another notification because version/lifecycle validation fails first.

Audit events cover creation, draft editing, activation, completion, cancellation, and task updates. Metadata is limited to student ID, status, version, and task count; full objectives, task descriptions, generated text, and request metadata are excluded. Optional audit/delivery failures are returned in `warnings` (`SUPPORT_PLAN_AUDIT_FAILED`, `SUPPORT_PLAN_NOTIFICATION_FAILED`, or `SUPPORT_PLAN_RECIPIENT_UNAVAILABLE`) without rolling back a saved plan. There is no delivery outbox or automatic retry in this phase; do not repeat a lifecycle action to retry notification delivery.

The UI blocks duplicate submissions while a request is pending and ignores obsolete responses after switching plans/accounts or unmounting. **Creation has no persistent idempotency token**: after an ambiguous network failure, refresh and inspect the list before creating another draft. Title equality is not a deduplication rule. There are no teacher management, permanent deletion, automatic academic outcome evaluation, or real-time plan updates; use Refresh to see another session's changes. Generated action text retains the generator's language and can be edited; interface labels support English and Vietnamese.

### Support-plan verification

Focused node:test suites use mocked database/authentication/notification calls and do not need running MySQL, Python inference, external AI requests, or model training:

```bash
node --test src/utils/supportPlanValidation.test.js src/services/supportPlanService.test.js src/controllers/supportPlanRoute.test.js src/services/notificationService.test.js
node --test frontend/src/utils/supportPlans.test.js frontend/src/locales/supportPlanLocaleParity.test.js
npm test
npm --prefix frontend test
npm --prefix frontend run build
git diff --check
```

Frontend tests exercise the shared form/prefill/state logic, navigation and localization contracts; they do not replace live browser verification of keyboard interaction and desktop/mobile rendering.

## Security & Privacy

### Authentication Security
- JWT tokens with 15-minute access token expiration
- Refresh token rotation with database-backed storage
- Password hashing using bcryptjs (12 salt rounds)
- HTTPS-only cookie settings in production
- SameSite=Strict attribute on session cookies
- Rate limiting on authentication endpoints (100 requests/15min)

### Data Protection
- All SQL queries use parameterized statements to prevent injection
- Origin/Referer header validation for CSRF protection
- Input validation and sanitization at API boundary
- Output encoding to prevent XSS in React templates
- SQL STRICT mode enforcement prevents invalid data storage
- Audit logs track creation/modification/deletion of sensitive entities
- Database connection pooling prevents resource exhaustion

### Privacy Protections
- Prediction history stores only allowlisted behavioral values
- Saved What-If scenarios contain no raw request data or metadata
- Model snapshots store only performance metrics and version hashes
- No storage of passwords, tokens, cookies, or request headers
- Personal data accessible only to authorized roles
- Anonymized analytics where possible
- Data minimization principle applied to all stored entities

### ML-Specific Protections
- Prediction events store inputs/outputs but not full student records
- Model versioning uses deterministic hashes of metrics + artifacts
- Drift calculation uses bounded, standardized metrics
- Feedback collection limited to accuracy metrics only
- No collection of sensitive personal information in ML pipeline

## Known Limitations & Gotchas

### Database & Import
- **MySQL STRICT Mode**: Invalid numeric/date values cause batch insert failures → importer falls back to row-by-row processing and logs errors to `import_errors.log`
- **Column Name Sanitization**: Reserved MySQL words (`order`, `group`, etc.) are prefixed with `col_`; all names converted to lowercase snake_case
- **Two-Pass Type Inference**: First 100 rows sampled for type detection; overflow values in later rows are coerced (NULL for dates, 0/1 for booleans)
- **ID Reservation**: Column named `id` in CSV becomes `col_id` to avoid conflict with surrogate primary key
- **Existing Databases**: Databases named `ffms` and `finsight` are preserved and unaffected by application operations
- **Weekly-check-in migration**: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` syntax incompatible with some MySQL versions; verify tables report `ready` before use

### Machine Learning Pipeline
- **Fixed Feature Schema**: ML pipeline uses exactly 10 predefined features regardless of CSV columns:
  ```
  gender, age, study_hours, attendance_percent, sleep_hours,
  previous_gpa, parental_education_level, internet_access,
  extracurricular_activities, part_time_job
  ```
- **Target Variables**: Models predict only `final_score` (regression) and `grade` (classification)
- **Artifact Compatibility**: Training and inference share interaction-feature engineering in `ml/feature_engineering.py`; deploy a matching preprocessor, regressor, classifier, and metrics set.
- **Drift Baseline Missing**: Initial `metrics.json` lacks baseline for drift calculation; first training establishes baseline
- **Non-Atomic Retraining**: Model files updated sequentially during retraining; brief window where predictor/preprocessor versions may mismatch
- **Connection Hardcoding**: `ml/fetch_data.py` uses hardcoded database credentials (should use environment variables)
- **Missing Dependency**: `ml/fetch_data.py` imports SQLAlchemy but it's not in `requirements.txt` (workaround: uses direct mysql2 via Node.js subprocess)

### Frontend & UX
- **Notification Polling**: Updates use visible-page HTTP polling at intervals of at least 60 seconds, not real-time push.
- **Teacher Scope**: Teachers have organization-wide access to analytics and ML monitoring (not classroom-limited).
- **Mobile Tables**: Wide data tables remain complete and scroll inside a labeled, contained region rather than hiding essential columns.
- **Bundle Size**: The production build currently reports a non-blocking warning for a JavaScript chunk above 500 kB; route-level code splitting remains future work.

### Testing & CI
- **Test Coverage**: Unit tests for services and utilities; integration tests for API endpoints
- **Frontend Testing**: Node's built-in test runner covers pure UI state, formatting, locale parity, and API-contract utilities
- **ML Testing**: Limited due to non-deterministic nature; focuses on pipeline integrity
- **CI Pipeline**: GitHub Actions runs on Ubuntu with Node.js 22; tests backend and frontend suites
- **Artifact Exclusion**: `node_modules`, ML model artifacts, and cached data are gitignored; do not include newly generated build output in feature changes

## Current Development Focus

The application implements a traditional machine learning pipeline (not LLM fine-tuning) for tabular student performance data. Active development areas include:

1. **ML Pipeline Alignment**: Harmonizing feature sets between training and inference
2. **Notification Enhancements**: Real-time updates via WebSocket migration
3. **Role-Based Scope Refinement**: Implementing classroom/section-based teacher restrictions
4. **Performance Optimization**: Query optimization and caching strategies
5. **Internationalization Expansion**: Adding additional language support beyond EN/VI
6. **Accessibility Audits**: WCAG 2.1 AA compliance verification
7. **ML Experiment Tracking**: Integrating MLflow for comprehensive model versioning

## Contributing

We welcome contributions to improve the application! Please follow these guidelines:

### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Ensure your code passes existing tests
5. Submit a pull request with clear description of changes

### Development Practices
- Follow existing code style and conventions
- Write unit tests for new functionality
- Update documentation as needed
- Keep pull requests focused on single concerns
- Test changes in development environment before submitting

### Reporting Issues
- Use GitHub Issues for bug reports and feature requests
- Include steps to reproduce, expected vs actual behavior
- Screenshots and console logs are helpful for UI issues
- Label issues appropriately (bug, enhancement, question, etc.)

### Code Review
- All PRs require review from maintainers
- Be responsive to reviewer feedback
- Ensure CI checks pass before requesting review
- Keep PR scope manageable for efficient review

## License

This project is distributed under the MIT License. See the `LICENSE` file for details.

*Note: A root LICENSE file should be present in the repository. If missing, the MIT license terms apply by declaration in package.json.*

## Acknowledgments

- [Kaggle Student Performance Dataset](https://www.kaggle.com/datasets/harshadapatil31/student-performance-and-study-habits-dataset) for the foundational data
- The open-source projects and libraries that make this application possible
- Contributors and users who provide feedback and improvements
- Educational institutions that inspire the mission of improving learning outcomes through data-driven insights

---

*Last updated: August 2026*  
*For support, please open an issue in the GitHub repository.*
