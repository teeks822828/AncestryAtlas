# Ancestry Atlas

A family mapping application that allows users to create geographic life events with a timeline slider.

## Features

- User registration and login with JWT authentication
- Interactive map with click-to-place markers
- Address/location search using OpenStreetMap
- Add title, description, and date to events
- Timeline slider for chronological navigation
- View family members' events (read-only)

## Tech Stack

- **Frontend:** React + Vite + React-Leaflet + React Router + Tailwind CSS
- **Backend:** Node.js + Express + JWT authentication
- **Database:** SQLite (via sql.js)
- **Map:** Leaflet with OpenStreetMap tiles

## Getting Started

### Prerequisites

- Node.js 18+ installed

### Installation

1. Install server dependencies:
```bash
cd server
npm install
```

2. Install client dependencies:
```bash
cd client
npm install
```

### Running the Application

1. Start the server (in one terminal):
```bash
cd server
npm start
```
Server runs at http://localhost:3001

2. Start the client (in another terminal):
```bash
cd client
npm run dev
```
Client runs at http://localhost:5173

### Usage

1. Open http://localhost:5173 in your browser
2. Click "Get Started" to register a new account
3. Optionally create a family name to share events with others
4. Click "Add Event" to start adding events
5. Click anywhere on the map to place a marker
6. Fill in the event details (title, date, description)
7. Use the timeline slider to navigate through events chronologically
8. Use the location search bar to find and zoom to specific places

## Project Structure

```
ancestry-atlas/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/         # UI components
│   │   ├── pages/              # Page components
│   │   ├── context/            # React context providers
│   │   └── hooks/              # Custom hooks
│   └── package.json
│
├── server/
│   ├── routes/                 # API routes
│   ├── models/                 # Database models
│   ├── middleware/             # Express middleware
│   ├── config/                 # Configuration
│   ├── server.js               # Express app entry
│   └── package.json
│
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Events
- `GET /api/events` - Get user's events
- `POST /api/events` - Create event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Family
- `GET /api/family/members` - List family members
- `GET /api/family/members/:id/events` - Get member's events
- `GET /api/family/events` - Get all family events
