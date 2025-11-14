# Emaús Vota - Election Management System

## Overview
Emaús Vota is a full-stack web application designed to manage elections for the UMP Emaús church youth group. It aims to streamline the electoral process, ensure fairness, and build trust through features like email authentication, role-based access, secure voting, real-time results, and transparent reporting (shareable images, PDF audits). The project is currently migrating to Cloudflare Workers to improve performance and reliability. The long-term vision is to expand Emaús Vota into a comprehensive portal for UMP Emaús, integrating devotionals, prayer requests, events, and member management.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend is built with React 18, TypeScript, Vite, Wouter, and TanStack Query. It uses shadcn/ui on Radix UI primitives, styled with Tailwind CSS, following a mobile-first Material Design approach with custom UMP Emaús branding (primary orange #FFA500). State management uses React Context API for authentication and local storage for tokens. Forms are handled by React Hook Form with Zod validation. The UI is responsive, localized in Portuguese, and offers features like circular image cropping for member photos, real-time results with smart sorting, and professional export options for election results (images, PDF audit reports).

### Technical Implementations
The system is migrating from a Node.js/Express/PostgreSQL backend to a serverless architecture using Cloudflare Workers.

**Current Backend (Cloudflare Workers):**
- **Framework:** Hono
- **Authentication:** Hybrid password hashing (bcrypt for legacy, PBKDF2 for new users), manual HMAC-SHA256 JWT implementation (2-hour expiration), 6-digit cryptographically secure verification codes (10-minute expiration) sent via Resend API.
- **Middlewares:** `createAuthMiddleware()` for JWT validation, `requireAdmin()`, `requireMember()` for role-based access control.
- **API Routes:** Implements authentication endpoints (`/api/auth/login`, `/api/auth/request-code`, `/api/auth/verify-code`, `/api/auth/set-password`) and photo serving (`/photos/*`).

### Feature Specifications
- Email/password authentication with JWT and 2-hour session auto-logout.
- Role-based access control (admin/member).
- Comprehensive election management (create, close, archive, per-position control).
- Candidate registration and secure, duplicate-prevented voting.
- Real-time results with vote counts and percentages.
- Admin panel for member registration, editing, attendance, and active status management.
- Automatic majority-based position closing and three-round scrutiny system with tie-resolution.
- Generation of shareable election results images and detailed PDF audit reports.
- Automated birthday email system.
- Circular image crop tool for member photos.
- Full mobile optimization.
- Tracking of active/inactive members without deleting data.

### System Design Choices
The architecture emphasizes a serverless, edge-computed backend for performance and scalability. Authentication is custom-built for security and flexibility. Data storage is distributed across Cloudflare's ecosystem.

**Future Planned Features (Portal UMP Emaús):**
- **Modules:** Home feed, Devotionals, Prayer Requests, Events, Directory, Voting, Member Area.
- **Secretariat System:** Manage secretariats with specific access panels.
- **Devotionals:** CRUD for devotional content with public display.
- **Prayer Requests:** Public submission, member-viewable details, status tracking.
- **Events:** CRUD for events with calendar view.
- **Directory:** Public display of board members with contact info.
- **Instagram Integration:** Automated post synchronization for home feed.
- **Expanded Permissions:** Granular access levels for visitors, common members, secretariat members, and admins.
- **New DB Tables:** `secretarias`, `devotionals`, `prayer_requests`, `events`, `instagram_posts`.

## External Dependencies

### Cloudflare Ecosystem
- **Cloudflare D1:** Serverless SQLite-based database.
- **Cloudflare R2:** S3-compatible object storage.
- **Cloudflare Workers:** Serverless runtime environment.

### Email Service
- **Resend:** For transactional emails and verification codes.

### UI Component Libraries
- **@radix-ui/**: Accessible UI primitives.
- **shadcn/ui**: Re-usable UI components built on Radix UI.
- **lucide-react**: Icon library.
- **react-easy-crop**: Interactive image cropping.

### Database Tooling
- **Drizzle ORM:** TypeScript ORM for database interactions.
- **Drizzle Kit:** Database migration and schema management.
- **better-sqlite3:** For local SQLite development.
- **@neondatabase/serverless**: For PostgreSQL deployment (legacy/future consideration).

### Validation
- **Zod:** Runtime schema validation.

### Development Tools
- **Vite:** Frontend build tool.
- **Wouter:** React routing library.
- **TanStack Query:** Server state management.
- **Hono:** Web framework for Workers.
- **tsx:** TypeScript execution.