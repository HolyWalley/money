# Claude Development Instructions

## Project Overview
Personal finances tracking app built with Local First principles using:
- PouchDB for local-first data storage
- React with TypeScript
- Cloudflare Pages for hosting
- Cloudflare Functions for minimal backend needs
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
- PouchDB for data storage
- Cloudflare Pages deployment
- Cloudflare Functions (minimal backend usage)
- Jest + React Testing Library for testing
- Vite for build tooling (with API proxy for development)
- Zod for data validation
- React Hook Form for form handling with field-level validation
- Tailwind CSS for styling
- shadcn/ui for UI components
- Lucide React for icons (consistent icon system)
- Wrangler for Cloudflare development

### State Management Strategy
- **Database State**: Rely on PouchDB
- **App State** (theme, UI preferences): Context API
- **Component State**: useState hook
- **No Redux** - keep it simple

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
- **Dev**: `npm run dev` (React app with API proxy to localhost:8787)
- **Dev Functions**: `npm run dev:functions` (Cloudflare Functions on port 8787)
- **Build**: `npm run build`
- **Test**: `npm run test`
- **Test UI**: `npm run test:ui`
- **Test Coverage**: `npm run test:coverage`
- **Lint**: `npm run lint`
- **Lint Fix**: `npm run lint:fix`
- **Typecheck**: `npm run typecheck`
- **Preview**: `npm run preview`

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
- **API Proxy**: /api requests proxied to localhost:8787 in development
- **Production**: /api routes handled directly by Cloudflare Functions
- **Dual Development**: Run both `npm run dev` and `npm run dev:functions` for full-stack development
- **API Structure**: functions/api/v1/ for Cloudflare Functions endpoints
- **Environment Variables**: .dev.vars for local CF Functions environment
- **SECURITY**: NEVER read contents of .dev.vars file under any circumstances
