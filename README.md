# Workspace v1 Build

A personal task, schedule & project-tracking system (Notion replacement) built with React, Node.js, and MongoDB.

## Project Structure

```
workspace-app/
├── src/                    # Frontend (Vite + React)
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   ├── lib/
│   └── App.tsx
├── backend/                # Backend (Express + Node.js)
│   └── src/
│       ├── models/         # Mongoose schemas
│       ├── services/       # Business logic
│       ├── routes/         # API endpoints
│       └── index.ts
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account or local MongoDB instance

### Frontend Setup

```bash
cd workspace-app
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### Backend Setup

```bash
cd workspace-app/backend
npm install
npm run dev
```

Backend runs on `http://localhost:3000`

## API Endpoints

### Threads

- `GET /api/threads` - List all threads
- `POST /api/threads` - Create thread
- `PUT /api/threads/:id` - Update thread
- `DELETE /api/threads/:id` - Delete thread

### Tasks

- `GET /api/tasks` - List tasks (supports filters)
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `PATCH /api/tasks/:id/complete` - Mark task done
- `DELETE /api/tasks/:id` - Delete task

### Grid

- `GET /api/grid/week/:date` - Get week view
- `POST /api/grid/regenerate` - Regenerate week

### Other Endpoints

- Wishlist: `/api/wishlist`
- Goals: `/api/goals`
- Settings: `/api/settings`

## Environment Variables

Create a `.env.local` file in both `workspace-app/` and `workspace-app/backend/`:

**Frontend (.env.local):**

```
VITE_API_URL=http://localhost:3000
```

**Backend (.env.local):**

```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/workspace
PORT=3000
```

## Tech Stack

- **Frontend:** Vite, React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Express, Node.js, TypeScript, Mongoose
- **Database:** MongoDB Atlas
- **Styling:** Tailwind CSS with custom light/dark theme
- **UI Components:** shadcn/ui (Card, Button, Badge)

## Features (Phase 1-5 Complete)

✅ Frontend layout with sidebar navigation
✅ Today, Week, Threads, Backlog, Wishlist, Goals, Settings views
✅ Tailwind CSS + dark mode support
✅ Basic task management UI
✅ MongoDB models for all entities
✅ Express API scaffolding
✅ Grid generation algorithm (backend)

## Next Steps

- Phase 6: Connect frontend to backend API
- Phase 7: Implement task CRUD
- Phase 8: Google Calendar integration
- Phase 9-14: Progressive feature implementation

## License

MIT
