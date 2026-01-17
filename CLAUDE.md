# Claude Development Instructions

## Project Overview
Personal finances tracking app built with Local First principles using:
- Yjs + Dexie.js for local-first data storage with conflict-free sync
- React with TypeScript
- Cloudflare Pages for hosting
- Cloudflare Worker for backend API
- Custom sync implementation for cross-device data synchronization
- Comprehensive test coverage
- Clean, readable code

## Development Guidelines

### Core Principles
1. **Local First**: Data should work offline and sync when online
2. **Test Coverage**: All code must be covered with tests
3. **Code Quality**: Well-written, easy to read code
4. **User Permission**: NEVER implement features not explicitly requested
5. **Suggest First**: If adding something not specifically asked for, suggest it first

### Tech Stack Requirements
- React with TypeScript
- Yjs for conflict-free replicated data types (CRDTs)
- Dexie.js for local IndexedDB storage
- dexie-react-hooks for reactive queries
- Cloudflare Pages deployment
- Cloudflare Worker for backend API
- Vitest + React Testing Library for testing
- Vite for build tooling (with API proxy for development)
- Zod for data validation
- React Hook Form for form handling with field-level validation
- Tailwind CSS for styling
- shadcn/ui for UI components
- Lucide React for icons (consistent icon system)
- Wrangler for Cloudflare development
- itty-router for Worker routing

### State Management Strategy
- **Database State**: Yjs + Dexie.js with reactive queries
- **App State** (theme, UI preferences): Context API
- **Component State**: useState hook
- **No Redux** - keep it simple

### Database Architecture
- **Yjs Documents**: Conflict-free replicated data types for offline-first sync
- **Dexie.js**: IndexedDB wrapper for local storage and querying
- **CRDT Operations**: All data mutations go through Yjs for automatic conflict resolution
- **Reactive Queries**: Components use `useLiveQuery` for automatic updates
- **Services**: Singleton services provide business logic layer
- **No Context Providers**: Direct service imports eliminate provider complexity

### Custom Sync Implementation
- **Local Storage**: Yjs updates stored in IndexedDB via y-indexeddb persistence
- **Cross-Device Sync**: Custom sync protocol using Cloudflare Worker KV storage
- **Update Tracking**: Local database tracks which updates have been synced
- **Conflict Resolution**: Yjs automatically merges conflicting changes using CRDTs
- **Device Identification**: Unique device IDs prevent self-sync loops
- **Incremental Sync**: Only new/unsynced updates are transmitted
- **Offline Support**: App works fully offline, syncs when connection restored
- **File Structure**:
  - `src/lib/crdts.ts` - Yjs document setup and CRUD operations
  - `src/lib/db-dexie.ts` - Dexie schema and configuration
  - `src/lib/sync.ts` - Custom sync implementation
  - `src/hooks/useSync.ts` - React hook for sync management

### UI Development Guidelines
- **Prefer existing components**: Use shadcn/ui components first
- **Customize only when needed**: Only create custom components when shadcn/ui doesn't cover the use case
- **Consistent styling**: Follow Tailwind + shadcn/ui patterns
- Ask me to install needed shadcn/ui components, do not install them yourself

### Theme Requirements
- **Two themes**: Light and Dark
- **Default**: System preference detection
- **User override**: Allow manual theme switching
- **Persistence**: Remember user's theme choice

### PWA & Mobile Requirements
- **PWA Support**: App should be installable as WebApp
- **Multi-platform**: Web browser, mobile browser, installed PWA
- **Mobile-first**: Optimize for mobile Safari (primary mobile browser)
- **iOS Specific**: Handle iPhone notch, Safari header colors, safe areas
- **Responsive**: Ensure good UX across all form factors
- **No caching for now**: Basic PWA setup without complex caching strategies

### Commands to Run
- **Dev**: `npm run dev` (React app with integrated Worker development)
- **Build**: `npm run build`
- **Test**: `npm run test`
- **Test UI**: `npm run test:ui`
- **Test Coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Lint Fix**: `npm run lint:fix`
- **Typecheck**: `npm run typecheck`
- **Preview**: `npm run preview`

### Testing
- **Framework**: Vitest (not Jest)
- **Run all tests**: `npm run test`
- **Run specific file**: `npm run test -- src/lib/period-utils.test.ts`
- **Run with UI**: `npm run test:ui`
- **Run with coverage**: `npm run test:coverage`
- **Test file location**: Tests are co-located with source files (e.g., `foo.ts` → `foo.test.ts`)
- **UTC in tests**: Use `UTCDate` from `@date-fns/utc` for date-related tests to ensure consistent results across timezones

### Important Notes
- Always run lint and typecheck commands after making changes
- Run `npm run lint:fix` before every commit to ensure files end with newlines
- Only commit when explicitly asked
- Follow existing code conventions and patterns
- Check for existing libraries before adding new dependencies
- Maintain security best practices
- No comments unless requested

### Code Quality Requirements
- **End-of-Line**: All files must end with a newline character (enforced by ESLint `eol-last` rule)
- **Linting**: Code must pass ESLint checks before commit
- **Type Safety**: All TypeScript errors must be resolved

### Development Setup
- **KV Namespace**: MONEY_USER_AUTH configured in wrangler.toml
- **Integrated Development**: Single `npm run dev` command runs both React app and Worker
- **Production**: /api routes handled directly by Cloudflare Worker
- **Worker Structure**: 
  - `worker/handlers/` - API handlers with onRequest* methods
  - `worker/utils/` - Utility modules (jwt, security, storage, etc.)
  - `worker/middleware/` - Security, auth, and header middleware
  - `worker/routes/` - Route configuration
  - `worker/types/` - Type definitions
- **Environment Variables**: .dev.vars for local Worker environment
- **SECURITY**: NEVER read contents of .dev.vars file under any circumstances

### Worker Architecture
- **Minimal index.ts**: Only essential imports and main fetch handler
- **Organized modules**: Clear separation of concerns across directories
- **Unified handlers**: Use onRequestGet, onRequestPost, onRequestPut convention
- **Namespace imports**: Import handlers as `signin.onRequestPost` for clarity
- **Middleware chain**: Security → Auth → Handler → Headers
